// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

const KEY = 'nevula.inapp.unread.v1';
const MAX_IDS = 99;
const NVL3_PREFIX = 'NVL3.';

type Store = {
  ids: string[];
  /** messageId → peerUserId (dashboard reconcile / known contacts). */
  peers: Record<string, string>;
  /** messageId → conversationId (per-chat list badges; Tor vs clear must not share). */
  conversations: Record<string, string>;
};

export type InAppUnreadSnapshot = {
  count: number;
  byPeer: Record<string, number>;
  byConversation: Record<string, number>;
};

let memory: Store | null = null;
let activeConversationId: string | null = null;
let activeChatAckOnArrive = false;
const listeners = new Set<(snapshot: InAppUnreadSnapshot) => void>();

function snapshotOf(store: Store): InAppUnreadSnapshot {
  const byPeer: Record<string, number> = {};
  const byConversation: Record<string, number> = {};
  for (const id of store.ids) {
    const peer = store.peers[id];
    if (peer) byPeer[peer] = (byPeer[peer] ?? 0) + 1;
    const cid = store.conversations[id];
    if (cid) byConversation[cid] = (byConversation[cid] ?? 0) + 1;
  }
  return { count: store.ids.length, byPeer, byConversation };
}

function emit(store: Store) {
  const snap = snapshotOf(store);
  for (const listener of listeners) {
    try {
      listener(snap);
    } catch {
      // Listener errors must not break unread tracking.
    }
  }
}

function normalizeStore(raw: Partial<Store> | null | undefined): Store {
  const ids = Array.isArray(raw?.ids)
    ? raw!.ids!.filter((id): id is string => typeof id === 'string').slice(0, MAX_IDS)
    : [];
  const peersIn = raw?.peers && typeof raw.peers === 'object' ? raw.peers : {};
  const convIn = raw?.conversations && typeof raw.conversations === 'object' ? raw.conversations : {};
  const peers: Record<string, string> = {};
  const conversations: Record<string, string> = {};
  for (const id of ids) {
    const peer = peersIn[id];
    if (typeof peer === 'string' && peer) peers[id] = peer;
    const cid = convIn[id];
    if (typeof cid === 'string' && cid) conversations[id] = cid;
  }
  return { ids, peers, conversations };
}

async function readStore(): Promise<Store> {
  if (memory) return memory;
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) {
    memory = { ids: [], peers: {}, conversations: {} };
    return memory;
  }
  try {
    memory = normalizeStore(JSON.parse(raw) as Partial<Store>);
  } catch {
    memory = { ids: [], peers: {}, conversations: {} };
  }
  return memory;
}

async function writeStore(next: Store) {
  memory = normalizeStore(next);
  // AFTER_FIRST_UNLOCK: still writable while the screen is off / app backgrounded
  // (WHEN_UNLOCKED often fails on Honor and drops unread + badge updates).
  await SecureStore.setItemAsync(KEY, JSON.stringify(memory), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  emit(memory);
}

export function isNvl3ChatBlobCiphertext(ciphertext: unknown): boolean {
  return typeof ciphertext === 'string' && ciphertext.startsWith(NVL3_PREFIX);
}

/** While a chat thread is open, inbound can auto-clear unread only if readable (not Tor-locked). */
export function setActiveUnreadChatPeer(conversationId: string | null, opts?: { ackOnArrive?: boolean }) {
  activeConversationId = conversationId;
  activeChatAckOnArrive = opts?.ackOnArrive === true;
}

export function getActiveUnreadChatPeer() {
  return activeConversationId;
}

export async function getInAppUnreadCount() {
  return (await readStore()).ids.length;
}

export async function hasInAppUnreadId(messageId: string) {
  if (!messageId) return false;
  return (await readStore()).ids.includes(messageId);
}

export async function getInAppUnreadSnapshot(): Promise<InAppUnreadSnapshot> {
  return snapshotOf(await readStore());
}

/** Full snapshot (total + per-peer + per-conversation). Prefer this in Messages list UI. */
export function subscribeInAppUnreadSnapshot(listener: (snapshot: InAppUnreadSnapshot) => void) {
  listeners.add(listener);
  void getInAppUnreadSnapshot()
    .then(listener)
    .catch(() => listener({ count: 0, byPeer: {}, byConversation: {} }));
  return () => {
    listeners.delete(listener);
  };
}

/** Total count only — dashboard / simple badges. */
export function subscribeInAppUnread(listener: (count: number) => void) {
  return subscribeInAppUnreadSnapshot(snap => listener(snap.count));
}

export async function noteInAppUnreadMessage(
  messageId: string,
  peerUserId?: string,
  conversationId?: string,
) {
  if (!messageId) return;
  if (conversationId && activeConversationId === conversationId && activeChatAckOnArrive) {
    await acknowledgeInAppUnreadIds([messageId]);
    return;
  }
  const store = await readStore();
  if (store.ids.includes(messageId)) {
    let changed = false;
    const peers = { ...store.peers };
    const conversations = { ...store.conversations };
    if (peerUserId && !peers[messageId]) {
      peers[messageId] = peerUserId;
      changed = true;
    }
    if (conversationId && !conversations[messageId]) {
      conversations[messageId] = conversationId;
      changed = true;
    }
    if (changed) {
      await writeStore({ ids: store.ids, peers, conversations });
      return;
    }
    emit(store);
    return;
  }
  const ids = [...store.ids, messageId].slice(-MAX_IDS);
  const peers = { ...store.peers };
  const conversations = { ...store.conversations };
  if (peerUserId) peers[messageId] = peerUserId;
  if (conversationId) conversations[messageId] = conversationId;
  for (const key of Object.keys(peers)) {
    if (!ids.includes(key)) delete peers[key];
  }
  for (const key of Object.keys(conversations)) {
    if (!ids.includes(key)) delete conversations[key];
  }
  await writeStore({ ids, peers, conversations });
}

export async function acknowledgeInAppUnreadIds(messageIds: string[]) {
  if (!messageIds.length) return;
  const drop = new Set(messageIds);
  const store = await readStore();
  const ids = store.ids.filter(id => !drop.has(id));
  if (ids.length === store.ids.length) {
    emit(store);
    return;
  }
  const peers = { ...store.peers };
  const conversations = { ...store.conversations };
  for (const id of drop) {
    delete peers[id];
    delete conversations[id];
  }
  await writeStore({ ids, peers, conversations });
}

/** Clear every unread tagged for this conversation (opening that chat). */
export async function acknowledgeInAppUnreadForConversation(conversationId: string) {
  if (!conversationId) return;
  const store = await readStore();
  const drop = store.ids.filter(id => store.conversations[id] === conversationId);
  if (!drop.length) {
    emit(store);
    return;
  }
  await acknowledgeInAppUnreadIds(drop);
}

/** @deprecated Prefer conversation-scoped clear; kept for older call sites. */
export async function acknowledgeInAppUnreadForPeer(peerUserId: string) {
  if (!peerUserId) return;
  const store = await readStore();
  const drop = store.ids.filter(id => store.peers[id] === peerUserId);
  if (!drop.length) {
    emit(store);
    return;
  }
  await acknowledgeInAppUnreadIds(drop);
}

/**
 * Drop unread rows with no peer mapping that are no longer waiting on the server.
 * Realtime INSERT often notes blob ids before decrypt attaches a peer — those stick on the dashboard.
 */
export async function acknowledgeInAppUnreadOrphans(stillOnServer: Set<string>) {
  const store = await readStore();
  const drop = store.ids.filter(id => !store.peers[id] && !stillOnServer.has(id));
  if (!drop.length) return;
  await acknowledgeInAppUnreadIds(drop);
}

/** Force-clear every peerless unread (used when the user is actively reading chats). */
export async function acknowledgeAllInAppUnreadOrphans() {
  const store = await readStore();
  const drop = store.ids.filter(id => !store.peers[id]);
  if (!drop.length) return;
  await acknowledgeInAppUnreadIds(drop);
}

/**
 * Dashboard reconcile: keep only ids that are still pending on the server or in the
 * local sealed inbox, and drop peerless leftovers that make ✉ blink with empty chats.
 */
export async function reconcileInAppUnread(opts: {
  pendingServerIds: string[];
  localSealedIds: string[];
  knownPeerIds?: string[];
}) {
  const keep = new Set([...opts.pendingServerIds, ...opts.localSealedIds]);
  const knownPeers = opts.knownPeerIds ? new Set(opts.knownPeerIds) : null;
  const store = await readStore();
  const drop = store.ids.filter(id => {
    if (!keep.has(id)) return true;
    const peer = store.peers[id];
    if (!peer) return true; // peerless never belongs on the dashboard badge
    if (knownPeers && !knownPeers.has(peer)) return true;
    return false;
  });
  if (drop.length) await acknowledgeInAppUnreadIds(drop);
  else emit(store);
}

/**
 * Opening a chat thread: clear that conversation's unread (+ loaded / sealed ids for it),
 * not every chat with the same peer (Tor vs clear must stay separate).
 */
export async function acknowledgeInAppUnreadAfterOpeningChat(
  conversationId: string,
  inboundMessageIds: string[],
  sealedIdsForConversation: string[] = [],
) {
  await acknowledgeInAppUnreadForConversation(conversationId);
  await acknowledgeInAppUnreadIds(inboundMessageIds);
  await acknowledgeInAppUnreadIds(sealedIdsForConversation);
  await acknowledgeAllInAppUnreadOrphans();
}

export async function pruneInAppUnread(pendingIds: Set<string>) {
  const store = await readStore();
  const ids = store.ids.filter(id => pendingIds.has(id));
  if (ids.length === store.ids.length) {
    emit(store);
    return;
  }
  const peers: Record<string, string> = {};
  const conversations: Record<string, string> = {};
  for (const id of ids) {
    if (store.peers[id]) peers[id] = store.peers[id];
    if (store.conversations[id]) conversations[id] = store.conversations[id];
  }
  await writeStore({ ids, peers, conversations });
}

export async function wipeInAppUnread() {
  memory = { ids: [], peers: {}, conversations: {} };
  activeConversationId = null;
  activeChatAckOnArrive = false;
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  emit(memory);
}

export function unreadLabel(count: number) {
  if (count <= 0) return '';
  if (count === 1) return '1 new message';
  return `${Math.min(99, count)} new messages`;
}

/** Compact count for list/header chips (no wording). */
export function unreadCountLabel(count: number) {
  if (count <= 0) return '';
  return String(Math.min(99, count));
}
