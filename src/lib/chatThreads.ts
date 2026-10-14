// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { localConversationId } from './localContacts';
import { toSecureStoreKey } from './secureStoreKey';

export type ChatThreadKind = 'dm' | 'group';

export type PendingMemberIntro = {
  nevulaId: string;
  displayName: string | null;
  p256Spki?: string;
  kemPk?: string;
  fingerprint?: string;
  fromUserId: string;
};

export type ChatThread = {
  conversationId: string;
  kind: ChatThreadKind;
  /** Other members (never includes me). */
  memberIds: string[];
  title: string | null;
  /** Immutable Tor policy for this thread once created. */
  torRequired: boolean;
  /** memberId (incl. me) → confirmed the torRequired policy. */
  confirmations: Record<string, boolean>;
  /**
   * Members announced via invite whose device key is not confirmed on this phone yet.
   * User must confirm before group send includes them.
   */
  pendingMembers?: Record<string, PendingMemberIntro>;
  createdAt: string;
};

function storeKey(userId: string) {
  return toSecureStoreKey('nevula', 'chat', 'threads', userId);
}

async function readAll(userId: string): Promise<Record<string, ChatThread>> {
  const raw = await SecureStore.getItemAsync(storeKey(userId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ChatThread> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const row = value as ChatThread;
      if (!row?.conversationId || !Array.isArray(row.memberIds)) continue;
      const pendingMembers =
        row.pendingMembers && typeof row.pendingMembers === 'object'
          ? (row.pendingMembers as Record<string, PendingMemberIntro>)
          : undefined;
      out[id] = {
        conversationId: row.conversationId,
        kind: row.kind === 'group' ? 'group' : 'dm',
        memberIds: row.memberIds.filter((m): m is string => typeof m === 'string' && m.length > 0),
        title: typeof row.title === 'string' ? row.title : null,
        torRequired: row.torRequired === true,
        confirmations: row.confirmations && typeof row.confirmations === 'object' ? row.confirmations : {},
        ...(pendingMembers && Object.keys(pendingMembers).length ? { pendingMembers } : {}),
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function writeAll(userId: string, all: Record<string, ChatThread>) {
  await SecureStore.setItemAsync(storeKey(userId), JSON.stringify(all), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function defaultDmConversationId(myUserId: string, peerUserId: string) {
  return localConversationId(myUserId, peerUserId);
}

export function isDefaultDmConversationId(conversationId: string, myUserId: string, peerUserId: string) {
  return conversationId === defaultDmConversationId(myUserId, peerUserId);
}

export function newDmConversationId() {
  return `nvl3:t:${globalThis.crypto.randomUUID()}`;
}

export function newGroupConversationId() {
  return `nvl3:g:${globalThis.crypto.randomUUID()}`;
}

/** I can write once I confirmed this thread's Tor policy. */
export function threadWriteReady(thread: ChatThread, myUserId: string): boolean {
  return thread.confirmations[myUserId] === true;
}

export function threadPendingConfirmCount(thread: ChatThread, myUserId: string): number {
  const needed = [myUserId, ...thread.memberIds];
  return needed.filter(id => thread.confirmations[id] !== true).length;
}

export async function listChatThreads(userId: string): Promise<ChatThread[]> {
  return Object.values(await readAll(userId)).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getChatThread(userId: string, conversationId: string): Promise<ChatThread | null> {
  const all = await readAll(userId);
  return all[conversationId] ?? null;
}

export async function upsertChatThread(userId: string, thread: ChatThread): Promise<ChatThread> {
  const all = await readAll(userId);
  const previous = all[thread.conversationId];
  let pendingMembers = previous?.pendingMembers;
  if (thread.pendingMembers !== undefined) {
    const next = { ...thread.pendingMembers };
    for (const id of Object.keys(next)) {
      if (id === userId) delete next[id];
    }
    pendingMembers = Object.keys(next).length ? next : undefined;
  }
  const merged: ChatThread = {
    ...previous,
    ...thread,
    conversationId: thread.conversationId,
    memberIds: [...new Set(thread.memberIds.filter(id => id && id !== userId))],
    confirmations: { ...(previous?.confirmations ?? {}), ...(thread.confirmations ?? {}) },
    pendingMembers,
    // Once Tor is required for a thread, never unlock. Clear → Tor is allowed once.
    torRequired: previous?.torRequired === true ? true : Boolean(thread.torRequired),
  };
  all[thread.conversationId] = merged;
  await writeAll(userId, all);
  return merged;
}

export async function clearPendingThreadMember(
  userId: string,
  conversationId: string,
  memberId: string,
): Promise<ChatThread | null> {
  const all = await readAll(userId);
  const thread = all[conversationId];
  if (!thread?.pendingMembers?.[memberId]) return thread ?? null;
  const pendingMembers = { ...thread.pendingMembers };
  delete pendingMembers[memberId];
  thread.pendingMembers = Object.keys(pendingMembers).length ? pendingMembers : undefined;
  all[conversationId] = thread;
  await writeAll(userId, all);
  return thread;
}

export async function markThreadConfirmed(
  userId: string,
  conversationId: string,
  memberId: string,
): Promise<ChatThread | null> {
  const all = await readAll(userId);
  const thread = all[conversationId];
  if (!thread) return null;
  thread.confirmations = { ...thread.confirmations, [memberId]: true };
  all[conversationId] = thread;
  await writeAll(userId, all);
  return thread;
}

/**
 * Ensure the legacy 1:1 conversation exists as a thread so multi-chat + groups
 * share one list model. Default DMs start write-ready (confirmations filled)
 * unless torRequired was already decided elsewhere.
 */
export async function ensureDefaultDmThread(params: {
  myUserId: string;
  peerUserId: string;
  torRequired?: boolean;
  mineConfirmed?: boolean;
  peerConfirmed?: boolean;
}): Promise<ChatThread> {
  const conversationId = defaultDmConversationId(params.myUserId, params.peerUserId);
  const existing = await getChatThread(params.myUserId, conversationId);
  if (existing) return existing;
  const torRequired = params.torRequired === true;
  const confirmations: Record<string, boolean> = {};
  if (params.mineConfirmed) confirmations[params.myUserId] = true;
  if (params.peerConfirmed) confirmations[params.peerUserId] = true;
  // Legacy open chats: if neither side required Tor, treat as confirmed clear chat.
  if (!torRequired && params.mineConfirmed !== false) {
    confirmations[params.myUserId] = confirmations[params.myUserId] ?? true;
    confirmations[params.peerUserId] = confirmations[params.peerUserId] ?? true;
  }
  return upsertChatThread(params.myUserId, {
    conversationId,
    kind: 'dm',
    memberIds: [params.peerUserId],
    title: null,
    torRequired,
    confirmations,
    createdAt: new Date().toISOString(),
  });
}

export async function findDmThreadForPeer(
  myUserId: string,
  peerUserId: string,
  torRequired: boolean,
): Promise<ChatThread | null> {
  const wantTor = torRequired === true;
  const threads = await listChatThreads(myUserId);
  const match = threads.find(
    (thread) =>
      thread.kind === 'dm'
      && thread.memberIds.length === 1
      && thread.memberIds[0] === peerUserId
      && thread.torRequired === wantTor,
  );
  if (match) return match;
  if (!wantTor) {
    const legacy = await getChatThread(myUserId, defaultDmConversationId(myUserId, peerUserId));
    if (legacy && legacy.kind === 'dm' && !legacy.torRequired) return legacy;
  }
  return null;
}

export async function createDmThread(params: {
  myUserId: string;
  peerUserId: string;
  torRequired: boolean;
}): Promise<ChatThread> {
  // One normal + one Tor DM per contact — reopen existing instead of duplicating.
  const existing = await findDmThreadForPeer(params.myUserId, params.peerUserId, params.torRequired);
  if (existing) return existing;
  const conversationId = params.torRequired
    ? newDmConversationId()
    : defaultDmConversationId(params.myUserId, params.peerUserId);
  return upsertChatThread(params.myUserId, {
    conversationId,
    kind: 'dm',
    memberIds: [params.peerUserId],
    title: null,
    torRequired: params.torRequired,
    confirmations: { [params.myUserId]: true },
    createdAt: new Date().toISOString(),
  });
}

export async function createGroupThread(params: {
  myUserId: string;
  memberIds: string[];
  title: string | null;
  torRequired: boolean;
}): Promise<ChatThread> {
  const members = [...new Set(params.memberIds.filter(id => id && id !== params.myUserId))];
  if (members.length < 1) throw new Error('Pick at least one contact for a group.');
  return upsertChatThread(params.myUserId, {
    conversationId: newGroupConversationId(),
    kind: 'group',
    memberIds: members,
    title: params.title?.trim() || null,
    torRequired: params.torRequired,
    confirmations: { [params.myUserId]: true },
    createdAt: new Date().toISOString(),
  });
}

/** Add contacts to an existing chat (1:1 becomes a group). Invites are sent separately. */
export async function addMembersToThread(params: {
  myUserId: string;
  conversationId: string;
  addMemberIds: string[];
  /** When inviting into a default DM that has no stored thread yet. */
  seed?: { peerUserId: string; torRequired: boolean; title?: string | null };
}): Promise<{ thread: ChatThread; addedIds: string[] }> {
  const add = [...new Set(params.addMemberIds.filter(id => id && id !== params.myUserId))];
  let thread = await getChatThread(params.myUserId, params.conversationId);
  if (!thread && params.seed?.peerUserId) {
    thread = await ensureDefaultDmThread({
      myUserId: params.myUserId,
      peerUserId: params.seed.peerUserId,
      torRequired: params.seed.torRequired,
      mineConfirmed: true,
      peerConfirmed: true,
    });
  }
  if (!thread) throw new Error('Chat not found.');
  const before = new Set(thread.memberIds);
  const merged = [...new Set([...thread.memberIds, ...add])];
  const addedIds = merged.filter(id => !before.has(id));
  if (!addedIds.length) return { thread, addedIds: [] };
  const kind: ChatThreadKind = merged.length > 1 ? 'group' : thread.kind;
  const next = await upsertChatThread(params.myUserId, {
    ...thread,
    kind,
    memberIds: merged,
    title: thread.title ?? params.seed?.title ?? null,
    confirmations: { ...thread.confirmations, [params.myUserId]: true },
  });
  return { thread: next, addedIds };
}

export async function removeChatThread(userId: string, conversationId: string) {
  const all = await readAll(userId);
  if (!all[conversationId]) return;
  delete all[conversationId];
  await writeAll(userId, all);
}

export async function wipeChatThreads(userId: string) {
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
}
