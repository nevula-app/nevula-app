// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { PrivacyTransport } from './types';

const TOR_CHECK_URL = 'https://check.torproject.org/api/ip';

/**
 * Phase-2 Tor readiness probe.
 * With Orbot (or another system Tor VPN) active, NEVULA traffic exits via Tor and
 * check.torproject.org reports IsTor=true. Without an external Tor path, probe fails
 * and NevTOR never claims "connected".
 *
 * Always uses an ungated fetch so NevTOR enablement cannot block its own probe.
 */
export class TorExitProbeTransport implements PrivacyTransport {
  readonly kind = 'tor' as const;
  private rawFetch: typeof fetch;

  constructor(rawFetch?: typeof fetch) {
    this.rawFetch = rawFetch ?? globalThis.fetch.bind(globalThis);
  }

  async start() {
    // No embedded daemon in Phase 2 — readiness is probe-only.
  }

  async stop() {
    // Nothing to tear down.
  }

  async probe(): Promise<{ ready: boolean; detail: string }> {
    const TIMEOUT_MS = 8_000;
    const run = async (): Promise<{ ready: boolean; detail: string }> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await this.rawFetch(TOR_CHECK_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (!response.ok) {
            return { ready: false, detail: `Tor check HTTP ${response.status}` };
          }
          const body = (await response.json()) as { IsTor?: boolean; IP?: string };
          if (body.IsTor === true) {
            return { ready: true, detail: 'Exit check confirmed Tor' };
          }
          return { ready: false, detail: 'Exit check is not Tor — enable Orbot VPN or another Tor path' };
        } finally {
          clearTimeout(timer);
        }
      } catch (error: any) {
        const msg = String(error?.message ?? 'Tor exit check failed');
        if (/abort/i.test(msg)) {
          return { ready: false, detail: 'Tor check timed out — open Orbot and try Recheck' };
        }
        return { ready: false, detail: msg };
      }
    };
    // Hard race: some older Android builds ignore AbortController on fetch.
    return Promise.race([
      run(),
      new Promise<{ ready: boolean; detail: string }>((resolve) => {
        setTimeout(
          () => resolve({ ready: false, detail: 'Tor check timed out — open Orbot and try Recheck' }),
          TIMEOUT_MS + 500,
        );
      }),
    ]);
  }
}

export class DirectPrivacyTransport implements PrivacyTransport {
  readonly kind = 'direct' as const;
  async start() {}
  async stop() {}
  async probe() {
    return { ready: true, detail: 'Direct path' };
  }
}
