// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { decryptUtf8, encryptUtf8 } from './localCrypto';

export type OutboxMessage = {
  id: string;
  peerUserId: string;
  plaintext: string;
  createdAt: string;
  expiresAt: string;
  conversationId?: string;
};

function outboxPath(userId: string) {
  return `${FileSystem.documentDirectory}nevula-outbox-${userId}.json.enc`;
}

async function readAll(userId: string): Promise<OutboxMessage[]> {
  const path = outboxPath(userId);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return [];
  try {
    const parsed = JSON.parse(await decryptUtf8(await FileSystem.readAsStringAsync(path))) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is OutboxMessage => (
      Boolean(item?.id && item?.peerUserId && item?.plaintext && item?.createdAt && item?.expiresAt)
    )) : [];
  } catch {
    return [];
  }
}

async function writeAll(userId: string, items: OutboxMessage[]) {
  await FileSystem.writeAsStringAsync(outboxPath(userId), await encryptUtf8(JSON.stringify(items)));
}

export async function appendOutbox(userId: string, item: OutboxMessage) {
  const items = await readAll(userId);
  items.push(item);
  await writeAll(userId, items);
}

export async function listOutboxForPeer(userId: string, peerUserId: string) {
  const now = Date.now();
  const items = await readAll(userId);
  const alive = items.filter(item => new Date(item.expiresAt).getTime() > now);
  if (alive.length !== items.length) await writeAll(userId, alive);
  return alive.filter(item => item.peerUserId === peerUserId);
}

export async function listOutboxForConversation(
  userId: string,
  conversationId: string,
  peerUserIds?: string[],
) {
  const now = Date.now();
  const items = await readAll(userId);
  const alive = items.filter(item => new Date(item.expiresAt).getTime() > now);
  if (alive.length !== items.length) await writeAll(userId, alive);
  const peerSet = peerUserIds ? new Set(peerUserIds) : null;
  return alive.filter(item => {
    if (peerSet && !peerSet.has(item.peerUserId)) return false;
    const cid = item.conversationId;
    if (cid) return cid === conversationId;
    return !peerSet || peerSet.size === 1;
  });
}

export async function removeOutboxMessage(userId: string, messageId: string) {
  await writeAll(userId, (await readAll(userId)).filter(item => item.id !== messageId));
}

export async function wipeOutbox(userId: string) {
  await FileSystem.deleteAsync(outboxPath(userId), { idempotent: true }).catch(() => undefined);
}

export async function wipeAllOutboxes() {
  const root = FileSystem.documentDirectory;
  if (!root) return;
  const listing = await FileSystem.readDirectoryAsync(root).catch(() => []);
  await Promise.all(listing
    .filter(name => name.startsWith('nevula-outbox-') && name.endsWith('.json.enc'))
    .map(name => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true }).catch(() => undefined)));
}
