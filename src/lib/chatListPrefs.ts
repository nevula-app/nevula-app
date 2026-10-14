// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKey } from './secureStoreKey';

export type ChatListPrefs = {
  /** Conversation ids kept at the top (order within this list matters). */
  pinned: string[];
  /** Full custom order for visible chats (pinned subset should match pinned[]). */
  order: string[];
  /** Soft-deleted from the Messages list (contacts remain). */
  hidden: string[];
};

const EMPTY: ChatListPrefs = { pinned: [], order: [], hidden: [] };

function storeKey(userId: string) {
  return toSecureStoreKey('nevula', 'chat', 'listprefs', userId);
}

async function read(userId: string): Promise<ChatListPrefs> {
  const raw = await SecureStore.getItemAsync(storeKey(userId));
  if (!raw) return { ...EMPTY, pinned: [], order: [], hidden: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<ChatListPrefs>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((x): x is string => typeof x === 'string') : [],
      order: Array.isArray(parsed.order) ? parsed.order.filter((x): x is string => typeof x === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return { pinned: [], order: [], hidden: [] };
  }
}

async function write(userId: string, prefs: ChatListPrefs) {
  await SecureStore.setItemAsync(storeKey(userId), JSON.stringify(prefs), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadChatListPrefs(userId: string) {
  return read(userId);
}

export async function unhideChatFromList(userId: string, conversationId: string) {
  const prefs = await read(userId);
  if (!prefs.hidden.includes(conversationId)) return prefs;
  prefs.hidden = prefs.hidden.filter(id => id !== conversationId);
  await write(userId, prefs);
  return prefs;
}

export async function hideChatFromList(userId: string, conversationId: string) {
  const prefs = await read(userId);
  if (!prefs.hidden.includes(conversationId)) prefs.hidden.push(conversationId);
  prefs.pinned = prefs.pinned.filter(id => id !== conversationId);
  prefs.order = prefs.order.filter(id => id !== conversationId);
  await write(userId, prefs);
  return prefs;
}

export async function setChatPinned(userId: string, conversationId: string, pinned: boolean) {
  const prefs = await read(userId);
  prefs.hidden = prefs.hidden.filter(id => id !== conversationId);
  if (pinned) {
    if (!prefs.pinned.includes(conversationId)) prefs.pinned = [conversationId, ...prefs.pinned];
    if (!prefs.order.includes(conversationId)) prefs.order = [conversationId, ...prefs.order];
  } else {
    prefs.pinned = prefs.pinned.filter(id => id !== conversationId);
  }
  await write(userId, prefs);
  return prefs;
}

export async function moveChatInList(
  userId: string,
  conversationId: string,
  direction: 'up' | 'down',
  visibleIds: string[],
) {
  const prefs = await read(userId);
  const pinnedSet = new Set(prefs.pinned);
  const isPinned = pinnedSet.has(conversationId);
  const group = visibleIds.filter(id => pinnedSet.has(id) === isPinned);
  const idx = group.indexOf(conversationId);
  if (idx < 0) return prefs;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= group.length) return prefs;
  return reorderChatInList(userId, conversationId, swap, visibleIds);
}

/** Place a chat at a new index within its pin group (pinned among pinned, rest among rest). */
export async function reorderChatInList(
  userId: string,
  conversationId: string,
  toIndexInGroup: number,
  visibleIds: string[],
) {
  const prefs = await read(userId);
  const pinnedSet = new Set(prefs.pinned);
  const isPinned = pinnedSet.has(conversationId);
  const group = visibleIds.filter(id => pinnedSet.has(id) === isPinned);
  const from = group.indexOf(conversationId);
  if (from < 0) return prefs;
  const to = Math.max(0, Math.min(group.length - 1, toIndexInGroup));
  if (from === to) return prefs;
  const nextGroup = [...group];
  const [item] = nextGroup.splice(from, 1);
  if (!item) return prefs;
  nextGroup.splice(to, 0, item);
  if (isPinned) {
    prefs.pinned = nextGroup;
  }
  const pinnedOrdered = isPinned ? nextGroup : prefs.pinned.filter(id => visibleIds.includes(id));
  const unpinned = isPinned
    ? visibleIds.filter(id => !pinnedSet.has(id))
    : nextGroup;
  prefs.order = [...pinnedOrdered, ...unpinned];
  await write(userId, prefs);
  return prefs;
}

/** Sort chats: pinned (distinct) first, then custom order, then rest. */
export function sortChatsByPrefs<T extends { conversationId: string }>(
  chats: T[],
  prefs: ChatListPrefs,
): T[] {
  const hidden = new Set(prefs.hidden);
  const visible = chats.filter(c => !hidden.has(c.conversationId));
  const byId = new Map(visible.map(c => [c.conversationId, c]));
  const pinned = prefs.pinned.map(id => byId.get(id)).filter((c): c is T => Boolean(c));
  const pinnedSet = new Set(pinned.map(c => c.conversationId));
  const restIds = prefs.order.filter(id => byId.has(id) && !pinnedSet.has(id));
  const orderedRest = restIds.map(id => byId.get(id)!);
  const seen = new Set([...pinnedSet, ...restIds]);
  const leftover = visible.filter(c => !seen.has(c.conversationId));
  return [...pinned, ...orderedRest, ...leftover];
}

/** Soft accent cycle so pinned chats look different from each other. */
export const PINNED_CHAT_TONES = [
  { border: '#4ea3ff', background: 'rgba(78,163,255,0.14)' },
  { border: '#7dba9a', background: 'rgba(125,186,154,0.14)' },
  { border: '#c9a227', background: 'rgba(201,162,39,0.14)' },
  { border: '#c9887a', background: 'rgba(201,136,122,0.14)' },
  { border: '#9b8fd4', background: 'rgba(155,143,212,0.14)' },
] as const;

export function pinnedToneFor(conversationId: string, pinnedIds: string[]) {
  const idx = pinnedIds.indexOf(conversationId);
  if (idx < 0) return null;
  return PINNED_CHAT_TONES[idx % PINNED_CHAT_TONES.length];
}
