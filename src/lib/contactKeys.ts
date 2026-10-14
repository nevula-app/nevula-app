// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

export type WatchedDeviceKey = {
  fingerprint?: string | null;
  p256Spki?: string | null;
  kemPk?: string | null;
};

type KeySnapshot = {
  fingerprints: string[];
  p256: string[];
  kem?: string[];
};

function storeKey(userId: string) {
  return `nevula.contact.keys.${userId}`;
}

function snapshotOf(keys: WatchedDeviceKey[]): KeySnapshot {
  const kem = [...new Set(keys.map(key => key.kemPk ?? '').filter(Boolean))].sort();
  return {
    fingerprints: [...new Set(keys.map(key => (key.fingerprint ?? '').replace(/\s/g, '').toUpperCase()).filter(Boolean))].sort(),
    p256: [...new Set(keys.map(key => key.p256Spki ?? '').filter(Boolean))].sort(),
    ...(kem.length ? { kem } : {}),
  };
}

function sameSnapshot(a: KeySnapshot, b: KeySnapshot) {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  const aKem = a.kem ?? [];
  const bKem = b.kem ?? [];
  if (aKem.length && bKem.length && JSON.stringify(aKem) !== JSON.stringify(bKem)) return false;
  const classicalA = { fingerprints: a.fingerprints, p256: a.p256 };
  const classicalB = { fingerprints: b.fingerprints, p256: b.p256 };
  // Filling in a KEM key after pairing must not look like a new device.
  return JSON.stringify(classicalA) === JSON.stringify(classicalB);
}

async function loadAll(userId: string): Promise<Record<string, KeySnapshot>> {
  const stored = await SecureStore.getItemAsync(storeKey(userId));
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, KeySnapshot] => {
        const value = entry[1] as KeySnapshot;
        return Array.isArray(value?.fingerprints) && Array.isArray(value?.p256);
      }),
    );
  } catch {
    return {};
  }
}

async function saveAll(userId: string, all: Record<string, KeySnapshot>) {
  await SecureStore.setItemAsync(storeKey(userId), JSON.stringify(all), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readContactKeys(userId: string, contactUserId: string): Promise<WatchedDeviceKey[] | null> {
  const previous = (await loadAll(userId))[contactUserId];
  if (!previous) return null;
  const count = Math.max(previous.fingerprints.length, previous.p256.length);
  if (!count) return null;
  return Array.from({ length: count }, (_, index) => ({
    fingerprint: previous.fingerprints[index] ?? null,
    p256Spki: previous.p256[index] ?? null,
    kemPk: previous.kem?.[index] ?? null,
  }));
}

/** Fill in a device key without dropping a post-quantum key the phone already stored. */
export async function mergeContactKey(userId: string, contactUserId: string, key: WatchedDeviceKey) {
  const existing = (await readContactKeys(userId, contactUserId)) ?? [];
  const prev = existing[0];
  await rememberContactKeys(userId, contactUserId, [{
    fingerprint: key.fingerprint || prev?.fingerprint || null,
    p256Spki: key.p256Spki || prev?.p256Spki || null,
    kemPk: key.kemPk || prev?.kemPk || null,
  }]);
}

export async function rememberContactKeys(userId: string, contactUserId: string, keys: WatchedDeviceKey[]) {
  const all = await loadAll(userId);
  all[contactUserId] = snapshotOf(keys);
  await saveAll(userId, all);
}

export async function checkContactKeys(userId: string, contactUserId: string, keys: WatchedDeviceKey[]): Promise<'new' | 'same' | 'changed'> {
  const next = snapshotOf(keys);
  if (!next.fingerprints.length && !next.p256.length && !next.kem?.length) return 'same';
  const all = await loadAll(userId);
  const previous = all[contactUserId];
  if (!previous) {
    all[contactUserId] = next;
    await saveAll(userId, all);
    return 'new';
  }
  return sameSnapshot(previous, next) ? 'same' : 'changed';
}

export async function forgetContactKeys(userId: string, contactUserId: string) {
  const all = await loadAll(userId);
  if (!all[contactUserId]) return;
  delete all[contactUserId];
  await saveAll(userId, all);
}

export async function wipeContactKeys(userId: string) {
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
}
