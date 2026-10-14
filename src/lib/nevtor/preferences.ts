// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import type { NevTorRoutingMode } from './types';

const MODE_KEY = 'nevula.nevtor.mode.v1';
const FALLBACK_KEY = 'nevula.nevtor.allowDirectFallback.v1';
/** Legacy Phase-2 keys — migrated once. */
const LEGACY_ENABLED_KEY = 'nevula.nevtor.enabled.v1';

export type NevTorPreferences = {
  routingMode: NevTorRoutingMode;
  /** Only used when routingMode === TOR_PREFERRED. */
  allowDirectFallback: boolean;
};

export async function loadNevTorPreferences(): Promise<NevTorPreferences> {
  const [modeRaw, fallbackRaw, legacyEnabled] = await Promise.all([
    SecureStore.getItemAsync(MODE_KEY),
    SecureStore.getItemAsync(FALLBACK_KEY),
    SecureStore.getItemAsync(LEGACY_ENABLED_KEY),
  ]);

  let routingMode: NevTorRoutingMode = 'OFF';
  if (modeRaw === 'TOR_PREFERRED' || modeRaw === 'OFF') {
    routingMode = modeRaw;
  } else if (modeRaw === 'TOR_ONLY') {
    // Phase 2 has no embedded Tor — hard TOR_ONLY blocked all chat when Orbot
    // was missing. Soften stored "On" to preferred so messaging keeps working.
    routingMode = 'TOR_PREFERRED';
  } else if (legacyEnabled === '1') {
    routingMode = 'TOR_PREFERRED';
  }

  const allowDirectFallback = fallbackRaw !== '0';
  if (modeRaw === 'TOR_ONLY') {
    await saveNevTorPreferences({ routingMode: 'TOR_PREFERRED', allowDirectFallback: true });
    return { routingMode: 'TOR_PREFERRED', allowDirectFallback: true };
  }
  return { routingMode, allowDirectFallback };
}

export async function saveNevTorPreferences(prefs: NevTorPreferences) {
  await SecureStore.setItemAsync(MODE_KEY, prefs.routingMode, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(FALLBACK_KEY, prefs.allowDirectFallback ? '1' : '0', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(LEGACY_ENABLED_KEY, prefs.routingMode === 'OFF' ? '0' : '1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
