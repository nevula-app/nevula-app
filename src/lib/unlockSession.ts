// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'nevula.unlock.session.v1';

/** Max stay-unlocked window after PIN (user-chosen). */
export const UNLOCK_SESSION_OPTIONS = [
  { id: '10m', label: '10 minutes', ms: 10 * 60 * 1000 },
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '2h', label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { id: '3h', label: '3 hours', ms: 3 * 60 * 60 * 1000 },
] as const;

export type UnlockSessionOptionId = (typeof UNLOCK_SESSION_OPTIONS)[number]['id'];

type StoredSession = {
  expiresAt: number;
  optionId: UnlockSessionOptionId;
};

function isOptionId(value: unknown): value is UnlockSessionOptionId {
  return UNLOCK_SESSION_OPTIONS.some(item => item.id === value);
}

export function msForUnlockSessionOption(id: UnlockSessionOptionId) {
  return UNLOCK_SESSION_OPTIONS.find(item => item.id === id)?.ms ?? UNLOCK_SESSION_OPTIONS[0].ms;
}

export async function loadUnlockSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!isOptionId(parsed.optionId) || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now()) {
      await clearUnlockSession();
      return null;
    }
    return { expiresAt: parsed.expiresAt, optionId: parsed.optionId };
  } catch {
    return null;
  }
}

export async function startUnlockSession(optionId: UnlockSessionOptionId) {
  const expiresAt = Date.now() + msForUnlockSessionOption(optionId);
  const payload: StoredSession = { expiresAt, optionId };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(payload), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return payload;
}

export async function clearUnlockSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
}

/** True while a chosen stay-unlocked window is still valid. */
export async function isUnlockSessionActive() {
  const session = await loadUnlockSession();
  return Boolean(session && session.expiresAt > Date.now());
}

export function isUnlockSessionActiveSync(expiresAt: number | null) {
  return typeof expiresAt === 'number' && expiresAt > Date.now();
}
