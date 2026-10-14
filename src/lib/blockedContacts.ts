// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKey } from './secureStoreKey';

function key(userId: string) { return toSecureStoreKey('nevula', 'blockedContacts', userId); }

export async function loadBlockedContacts(userId: string): Promise<Set<string>> {
  const raw = await SecureStore.getItemAsync(key(userId));
  if (!raw) return new Set();
  try { return new Set((JSON.parse(raw) as unknown[]).filter((value): value is string => typeof value === 'string')); }
  catch { return new Set(); }
}

export async function setContactBlocked(userId: string, contactUserId: string, blocked: boolean) {
  const current = await loadBlockedContacts(userId);
  if (blocked) current.add(contactUserId); else current.delete(contactUserId);
  await SecureStore.setItemAsync(key(userId), JSON.stringify([...current]));
  return current;
}

export async function wipeBlockedContacts(userId: string) {
  await SecureStore.deleteItemAsync(key(userId)).catch(() => undefined);
}
