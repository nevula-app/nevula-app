// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { wipePrivateContent } from './wipe';
import { isPrivateContentExpired } from './inactivityPolicy';

const LAST_PRIVATE_ACCESS_KEY = 'nevula.privateContent.lastAccess.v1';
let enforcement: Promise<boolean> | null = null;

async function readLastPrivateAccess() {
  const stored = await SecureStore.getItemAsync(LAST_PRIVATE_ACCESS_KEY);
  if (!stored) return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function writeLastPrivateAccess(at: number) {
  await SecureStore.setItemAsync(LAST_PRIVATE_ACCESS_KEY, String(at), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function recordPrivateAccess(at = Date.now()) {
  await writeLastPrivateAccess(at);
}

export async function enforcePrivateContentExpiry(now = Date.now()) {
  if (enforcement) return enforcement;
  enforcement = (async () => {
    const lastAccess = await readLastPrivateAccess();
    if (lastAccess === null) {
      // Existing installations start their mandatory window with this upgrade.
      await writeLastPrivateAccess(now);
      return false;
    }
    if (!isPrivateContentExpired(lastAccess, now)) return false;
    await wipePrivateContent();
    await writeLastPrivateAccess(now);
    return true;
  })();
  try {
    return await enforcement;
  } finally {
    enforcement = null;
  }
}

export async function clearPrivateAccessTimestamp() {
  await SecureStore.deleteItemAsync(LAST_PRIVATE_ACCESS_KEY).catch(() => undefined);
}
