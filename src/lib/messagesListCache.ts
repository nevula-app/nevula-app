// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKey } from './secureStoreKey';
import type { ChatListPrefs } from './chatListPrefs';

/** Lightweight snapshot so Messages opens instantly without waiting on identity/network. */
export type MessagesListCacheSnapshot = {
  userId: string;
  savedAt: number;
  contacts: unknown[];
  chats: unknown[];
  requests: unknown[];
  listPrefs: ChatListPrefs;
  torChatKeys: string[];
};

const memory = new Map<string, MessagesListCacheSnapshot>();

function storeKey(userId: string) {
  return toSecureStoreKey('nevula', 'messages', 'listcache', userId);
}

export function peekMessagesListCache(userId: string): MessagesListCacheSnapshot | null {
  return memory.get(userId) ?? null;
}

export async function loadMessagesListCache(userId: string): Promise<MessagesListCacheSnapshot | null> {
  if (!userId) return null;
  const hit = memory.get(userId);
  if (hit) return hit;
  const raw = await SecureStore.getItemAsync(storeKey(userId)).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MessagesListCacheSnapshot;
    if (!parsed?.userId || parsed.userId !== userId || !Array.isArray(parsed.chats)) return null;
    memory.set(userId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function saveMessagesListCache(snapshot: MessagesListCacheSnapshot): Promise<void> {
  if (!snapshot.userId) return;
  const next: MessagesListCacheSnapshot = {
    ...snapshot,
    savedAt: Date.now(),
  };
  memory.set(snapshot.userId, next);
  await SecureStore.setItemAsync(storeKey(snapshot.userId), JSON.stringify(next), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
}

export async function wipeMessagesListCache(userId?: string): Promise<void> {
  if (userId) {
    memory.delete(userId);
    await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
    return;
  }
  memory.clear();
}
