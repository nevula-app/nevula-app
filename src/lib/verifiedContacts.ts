// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

export type VerificationMethod = 'in_person' | 'key';

function storeKey(userId: string) {
  return `nevula.verified.contacts.${userId}`;
}

function filePath(userId: string) {
  return `${FileSystem.documentDirectory}nevula-verified-${userId}.json`;
}

function asMethod(value: unknown): VerificationMethod | null {
  if (value === true || value === 'in_person') return 'in_person';
  if (value === 'key') return 'key';
  return null;
}

function normalize(raw: unknown): Record<string, VerificationMethod> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([contactId, value]) => {
      const method = asMethod(value);
      return method ? [[contactId, method] as const] : [];
    }),
  );
}

async function loadAll(userId: string): Promise<Record<string, VerificationMethod>> {
  // Prefer durable file store (Honor often drops SecureStore WHEN_UNLOCKED / flaky writes).
  try {
    const path = filePath(userId);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(path)) as unknown;
      const fromFile = normalize(parsed);
      if (Object.keys(fromFile).length) return fromFile;
    }
  } catch {
    // Fall through to SecureStore.
  }
  const stored = await SecureStore.getItemAsync(storeKey(userId));
  if (!stored) return {};
  try {
    return normalize(JSON.parse(stored) as unknown);
  } catch {
    return {};
  }
}

async function saveAll(userId: string, all: Record<string, VerificationMethod>) {
  const payload = JSON.stringify(all);
  await FileSystem.writeAsStringAsync(filePath(userId), payload).catch(() => undefined);
  await SecureStore.setItemAsync(storeKey(userId), payload, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
}

export async function loadVerifiedContacts(userId: string): Promise<Map<string, VerificationMethod>> {
  return new Map(Object.entries(await loadAll(userId)));
}

export async function loadVerifiedContactIds(userId: string): Promise<Set<string>> {
  return new Set(Object.keys(await loadAll(userId)));
}

export async function markContactVerified(
  userId: string,
  contactUserId: string,
  method: VerificationMethod = 'in_person',
) {
  if (!userId || !contactUserId) return;
  const all = await loadAll(userId);
  const previous = all[contactUserId];
  // Prefer keeping an existing in-person mark over downgrading to key.
  if (previous === 'in_person' && method === 'key') {
    return;
  }
  all[contactUserId] = method;
  await saveAll(userId, all);
}

export async function unverifyContact(userId: string, contactUserId: string) {
  const all = await loadAll(userId);
  if (!all[contactUserId]) return;
  delete all[contactUserId];
  await saveAll(userId, all);
}

export async function wipeVerifiedContacts(userId: string) {
  await FileSystem.deleteAsync(filePath(userId), { idempotent: true }).catch(() => undefined);
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
}
