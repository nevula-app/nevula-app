// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { decryptUtf8, encryptUtf8 } from './localCrypto';

export type SealedInboxMessage = {
  id: string;
  peerUserId: string;
  plaintext: string;
  createdAt: string;
  expiresAt: string;
  /** Present for multi-chat / group threads; absent = default 1:1 with peer. */
  conversationId?: string;
};

function inboxPath(userId: string) {
  return `${FileSystem.documentDirectory}nevula-sealed-inbox-${userId}.json.enc`;
}

function isRow(value: unknown): value is SealedInboxMessage {
  const row = value as SealedInboxMessage;
  return Boolean(row?.id && row?.peerUserId && row?.plaintext && row?.createdAt && row?.expiresAt);
}

async function readAll(userId: string): Promise<SealedInboxMessage[]> {
  const path = inboxPath(userId);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return [];
  try {
    const parsed = JSON.parse(await decryptUtf8(await FileSystem.readAsStringAsync(path))) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRow) : [];
  } catch {
    return [];
  }
}

async function writeAll(userId: string, items: SealedInboxMessage[]) {
  await FileSystem.writeAsStringAsync(inboxPath(userId), await encryptUtf8(JSON.stringify(items)));
}

export async function hasSealedInboxMessage(userId: string, messageId: string) {
  return (await readAll(userId)).some(item => item.id === messageId);
}

export async function mergeSealedInbox(userId: string, item: SealedInboxMessage) {
  const items = await readAll(userId);
  const byId = new Map(items.map(row => [row.id, row]));
  byId.set(item.id, item);
  await writeAll(userId, [...byId.values()]);
}

/** Keep recently opened messages briefly past server expiry so Tor delay cannot hide them. */
const LIST_GRACE_MS = 60 * 60 * 1000;

export async function listSealedInboxForPeer(userId: string, peerUserId: string) {
  const now = Date.now();
  const items = await readAll(userId);
  const alive = items.filter(item => {
    const exp = new Date(item.expiresAt).getTime();
    if (Number.isNaN(exp)) return true;
    return exp + LIST_GRACE_MS > now;
  });
  if (alive.length !== items.length) await writeAll(userId, alive);
  return alive.filter(item => item.peerUserId === peerUserId);
}

export async function listSealedInboxForConversation(
  userId: string,
  conversationId: string,
  peerUserIds?: string[],
) {
  const now = Date.now();
  const items = await readAll(userId);
  const alive = items.filter(item => {
    const exp = new Date(item.expiresAt).getTime();
    if (Number.isNaN(exp)) return true;
    return exp + LIST_GRACE_MS > now;
  });
  if (alive.length !== items.length) await writeAll(userId, alive);
  const peerSet = peerUserIds?.length ? new Set(peerUserIds) : null;
  return alive.filter(item => {
    if (peerSet && !peerSet.has(item.peerUserId)) return false;
    if (item.conversationId) return item.conversationId === conversationId;
    // Legacy untagged rows only surface on the default 1:1 id for that single peer.
    return peerSet?.size === 1 && conversationId.startsWith('nvl3:') && !conversationId.startsWith('nvl3:t:') && !conversationId.startsWith('nvl3:g:');
  });
}

/** Ids still held locally (opened ciphertext) — used so unread is not pruned after server delete. */
export async function listSealedInboxIds(userId: string): Promise<string[]> {
  return (await readAll(userId)).map(item => item.id);
}

export async function wipeSealedInbox(userId: string) {
  await FileSystem.deleteAsync(inboxPath(userId), { idempotent: true }).catch(() => undefined);
}

export async function wipeAllSealedInboxes() {
  const root = FileSystem.documentDirectory;
  if (!root) return;
  const listing = await FileSystem.readDirectoryAsync(root).catch(() => []);
  await Promise.all(listing
    .filter(name => name.startsWith('nevula-sealed-inbox-') && name.endsWith('.json.enc'))
    .map(name => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true }).catch(() => undefined)));
}
