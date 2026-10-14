// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Fail-closed HTTP gate for NEVULA API traffic when NevTOR is enabled.
 * Uses the manager's live probe state — never the settings toggle alone.
 */

import { nevTorManager } from './manager';
import { NevTorBlockedError } from './types';

export function createNevTorGatedFetch(rawFetch: typeof fetch = globalThis.fetch.bind(globalThis)): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      await nevTorManager.bootstrap();
      nevTorManager.assertOutboundAllowed();
    } catch (error) {
      if (error instanceof NevTorBlockedError) throw error;
      throw error;
    }
    return rawFetch(input, init);
  }) as typeof fetch;
}
