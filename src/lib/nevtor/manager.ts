// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { loadNevTorPreferences, saveNevTorPreferences, type NevTorPreferences } from './preferences';
import { DirectPrivacyTransport, TorExitProbeTransport } from './transport';
import {
  NevTorBlockedError,
  type NevTorRoutingMode,
  type NevTorSnapshot,
  type PrivacyTransport,
} from './types';

type Listener = (snapshot: NevTorSnapshot) => void;

function nowIso() {
  return new Date().toISOString();
}

function usingFallback(prefs: Pick<NevTorPreferences, 'routingMode' | 'allowDirectFallback'>, torReady: boolean) {
  return prefs.routingMode === 'TOR_PREFERRED' && prefs.allowDirectFallback && !torReady;
}

/**
 * Central NevTOR manager. UI must never claim "connected" from the mode alone.
 */
export class NevTorManager {
  private snapshot: NevTorSnapshot = {
    routingMode: 'OFF',
    allowDirectFallback: true,
    connection: 'disabled',
    torReady: false,
    usingDirectFallback: false,
    lastChangedAt: nowIso(),
    lastError: null,
    probeDetail: null,
  };
  private listeners = new Set<Listener>();
  private bootstrapped = false;
  private runToken = 0;
  private torTransport: PrivacyTransport = new TorExitProbeTransport();
  private directTransport: PrivacyTransport = new DirectPrivacyTransport();

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setTransports(params: { tor?: PrivacyTransport; direct?: PrivacyTransport }) {
    if (params.tor) this.torTransport = params.tor;
    if (params.direct) this.directTransport = params.direct;
  }

  async bootstrap() {
    if (this.bootstrapped) return this.snapshot;
    this.bootstrapped = true;
    const prefs = await loadNevTorPreferences();
    await this.applyPreferences(prefs, { probe: prefs.routingMode !== 'OFF' });
    return this.snapshot;
  }

  async setRoutingMode(routingMode: NevTorRoutingMode) {
    const prefs = await loadNevTorPreferences();
    const next: NevTorPreferences = { ...prefs, routingMode };
    await saveNevTorPreferences(next);
    // Never hang the UI forever on Orbot probe (old Android / no VPN).
    await Promise.race([
      this.applyPreferences(next, { probe: routingMode !== 'OFF' }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (routingMode === 'OFF') {
            resolve();
            return;
          }
          if (this.snapshot.connection === 'connecting'
            || this.snapshot.connection === 'starting'
            || this.snapshot.connection === 'reconnecting') {
            this.publish({
              routingMode,
              allowDirectFallback: next.allowDirectFallback,
              connection: 'unavailable',
              torReady: false,
              usingDirectFallback: usingFallback(next, false),
              lastError: 'Tor check timed out — open Orbot and tap Recheck',
              probeDetail: 'Tor check timed out',
            });
          }
          resolve();
        }, 9_000);
      }),
    ]);
  }

  async setAllowDirectFallback(allowDirectFallback: boolean) {
    const prefs = await loadNevTorPreferences();
    const next: NevTorPreferences = { ...prefs, allowDirectFallback };
    await saveNevTorPreferences(next);
    this.publish({
      allowDirectFallback,
      usingDirectFallback: usingFallback(next, this.snapshot.torReady),
    });
  }

  /** @deprecated Prefer setRoutingMode. Kept for older call sites. */
  async setEnabled(enabled: boolean) {
    await this.setRoutingMode(enabled ? 'TOR_PREFERRED' : 'OFF');
  }

  async setTorOnly(torOnly: boolean) {
    const prefs = await loadNevTorPreferences();
    if (prefs.routingMode === 'OFF') {
      await this.setRoutingMode(torOnly ? 'TOR_ONLY' : 'TOR_PREFERRED');
      return;
    }
    await this.setRoutingMode(torOnly ? 'TOR_ONLY' : 'TOR_PREFERRED');
  }

  async refresh() {
    if (this.snapshot.routingMode === 'OFF') return this.snapshot;
    return this.runProbe(this.snapshot.routingMode, this.snapshot.allowDirectFallback);
  }

  /**
   * Outbound gate:
   * - inbox receive bypass → allow (decrypt/notify must not wait on Tor probe)
   * - OFF → allow
   * - connected via Tor → allow
   * - TOR_PREFERRED + allowDirectFallback → allow clearnet (UI must show warning)
   * - TOR_ONLY or optional without fallback → fail closed
   */
  private inboxReceiveDepth = 0;

  /** Allow Supabase inbox fetch/decrypt even while NevTOR probe is not ready. */
  async withInboxReceiveAllowed<T>(fn: () => Promise<T>): Promise<T> {
    this.inboxReceiveDepth += 1;
    try {
      return await fn();
    } finally {
      this.inboxReceiveDepth = Math.max(0, this.inboxReceiveDepth - 1);
    }
  }

  assertOutboundAllowed() {
    if (this.inboxReceiveDepth > 0) return;
    if (this.snapshot.routingMode === 'OFF') return;
    if (this.snapshot.torReady && this.snapshot.connection === 'connected') return;
    if (this.snapshot.routingMode === 'TOR_PREFERRED' && this.snapshot.allowDirectFallback) return;
    throw new NevTorBlockedError(
      this.snapshot.connection === 'connecting' || this.snapshot.connection === 'starting'
        ? 'Waiting for NevTOR — try Recheck, or turn NevTOR off to send now.'
        : 'NevTOR not ready — turn NevTOR off to send messages, or Recheck when Tor is available.',
    );
  }

  isOutboundAllowed() {
    try {
      this.assertOutboundAllowed();
      return true;
    } catch {
      return false;
    }
  }

  private async applyPreferences(prefs: NevTorPreferences, opts: { probe: boolean }) {
    if (prefs.routingMode === 'OFF') {
      this.runToken += 1;
      await this.torTransport.stop().catch(() => undefined);
      this.publish({
        routingMode: 'OFF',
        allowDirectFallback: prefs.allowDirectFallback,
        connection: 'disabled',
        torReady: false,
        usingDirectFallback: false,
        lastError: null,
        probeDetail: null,
      });
      return;
    }
    this.publish({
      routingMode: prefs.routingMode,
      allowDirectFallback: prefs.allowDirectFallback,
      connection: 'starting',
      torReady: false,
      usingDirectFallback: false,
      lastError: null,
      probeDetail: null,
    });
    if (opts.probe) await this.runProbe(prefs.routingMode, prefs.allowDirectFallback);
  }

  private async runProbe(mode: Exclude<NevTorRoutingMode, 'OFF'>, allowDirectFallback: boolean) {
    const token = ++this.runToken;
    this.publish({
      routingMode: mode,
      allowDirectFallback,
      connection: this.snapshot.connection === 'connected' ? 'reconnecting' : 'connecting',
      torReady: false,
      usingDirectFallback: false,
      lastError: null,
      probeDetail: null,
    });
    try {
      await this.torTransport.start();
      if (token !== this.runToken) return this.snapshot;
      const result = await this.torTransport.probe();
      if (token !== this.runToken) return this.snapshot;
      if (result.ready) {
        this.publish({
          routingMode: mode,
          allowDirectFallback,
          connection: 'connected',
          torReady: true,
          usingDirectFallback: false,
          lastError: null,
          probeDetail: result.detail,
        });
      } else {
        this.publish({
          routingMode: mode,
          allowDirectFallback,
          connection: 'unavailable',
          torReady: false,
          usingDirectFallback: usingFallback({ routingMode: mode, allowDirectFallback }, false),
          lastError: result.detail,
          probeDetail: result.detail,
        });
      }
    } catch (error: any) {
      if (token !== this.runToken) return this.snapshot;
      this.publish({
        routingMode: mode,
        allowDirectFallback,
        connection: 'error',
        torReady: false,
        usingDirectFallback: usingFallback({ routingMode: mode, allowDirectFallback }, false),
        lastError: error?.message ?? 'NevTOR error',
        probeDetail: null,
      });
    }
    return this.snapshot;
  }

  private publish(partial: Partial<NevTorSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      lastChangedAt: nowIso(),
    };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const nevTorManager = new NevTorManager();
