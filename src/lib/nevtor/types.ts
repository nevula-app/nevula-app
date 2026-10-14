// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export type NevTorRoutingMode = 'OFF' | 'TOR_PREFERRED' | 'TOR_ONLY';

export type NevTorConnectionState =
  | 'disabled'
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'
  | 'error';

export type NevTorSnapshot = {
  routingMode: NevTorRoutingMode;
  /** TOR_PREFERRED: allow clearnet when Tor is down. Never silent — UI must warn. */
  allowDirectFallback: boolean;
  connection: NevTorConnectionState;
  /** True only after a live Tor probe succeeds while mode ≠ OFF. */
  torReady: boolean;
  /** True when optional mode is on Tor-down and traffic may use clearnet. */
  usingDirectFallback: boolean;
  lastChangedAt: string;
  lastError: string | null;
  probeDetail: string | null;
};

export type PrivacyTransportKind = 'direct' | 'tor';

export interface PrivacyTransport {
  readonly kind: PrivacyTransportKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Live readiness — never inferred from settings alone. */
  probe(): Promise<{ ready: boolean; detail: string }>;
}

export class NevTorBlockedError extends Error {
  constructor(message = 'NevTOR is required for this connection but is not available.') {
    super(message);
    this.name = 'NevTorBlockedError';
  }
}

/** Compact chip / subtitle — NevTOR routing only (never the NVL3 crypto label). */
export function chipForNevTorSnapshot(snapshot: NevTorSnapshot): {
  label: string;
  tone: 'off' | 'on' | 'wait' | 'warn';
} {
  if (snapshot.routingMode === 'OFF') {
    return { label: 'NevTOR', tone: 'off' };
  }
  if (snapshot.torReady && snapshot.connection === 'connected') {
    return { label: 'NevTOR', tone: 'on' };
  }
  if (
    snapshot.connection === 'connecting'
    || snapshot.connection === 'starting'
    || snapshot.connection === 'reconnecting'
  ) {
    return { label: 'Connecting…', tone: 'wait' };
  }
  if (snapshot.usingDirectFallback) {
    return { label: 'NevTOR…', tone: 'warn' };
  }
  return { label: 'Not ready', tone: 'warn' };
}

export function labelForNevTorSnapshot(snapshot: NevTorSnapshot): {
  title: string;
  detail: string;
  connectionLine: string;
} {
  if (snapshot.routingMode === 'OFF') {
    return {
      title: 'NevTOR off',
      detail: 'End-to-end encryption stays on. NEVULA uses the normal connection (not Tor).',
      connectionLine: 'Connection: Direct',
    };
  }
  switch (snapshot.connection) {
    case 'connected':
      return {
        title: 'NevTOR active',
        detail: 'Your NEVULA connection is currently routed through NevTOR.',
        connectionLine: 'Connection: NevTOR',
      };
    case 'starting':
    case 'connecting':
    case 'reconnecting':
      return {
        title: 'Connecting to NevTOR…',
        detail: 'Live check in progress. Status updates when the probe finishes.',
        connectionLine: 'Connection: Connecting…',
      };
    case 'unavailable':
    case 'error':
      if (snapshot.usingDirectFallback) {
        return {
          title: 'NevTOR unavailable',
          detail:
            'Tor is down. Direct connection is temporarily allowed (optional mode). This is not a Tor-protected path.',
          connectionLine: 'Connection: Direct (fallback)',
        };
      }
      return {
        title: 'NevTOR not ready',
        detail:
          snapshot.routingMode === 'TOR_ONLY'
            ? 'NevTOR Only: no network until Tor is available. No clearnet fallback.'
            : (snapshot.lastError
              ?? 'Tor path not ready yet. Messaging can still use the normal connection while NevTOR is On.'),
        connectionLine: 'Connection: Not ready',
      };
    default:
      return {
        title: 'NevTOR',
        detail: 'Turn NevTOR on or off.',
        connectionLine: 'Connection: —',
      };
  }
}

export function modeLabel(mode: NevTorRoutingMode): string {
  return mode === 'OFF' ? 'Off' : 'On';
}
