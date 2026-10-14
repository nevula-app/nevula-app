// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { decryptUtf8, encryptUtf8 } from './localCrypto';

export type LegacyInboxRow = {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  createdAt: string;
  expiresAt: string | null;
};

function inboxPath(userId: string) {
  return `${FileSystem.documentDirectory}nevula-legacy-inbox-${userId}.json.enc`;
}

function isRow(value: unknown): value is LegacyInboxRow {
  const row = value as LegacyInboxRow;
  return Boolean(row?.id && row?.conversationId && row?.senderId && row?.ciphertext && row?.createdAt);
}

async function readAll(userId: string): Promise<LegacyInboxRow[]> {
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

async function writeAll(userId: string, items: LegacyInboxRow[]) {
  await FileSystem.writeAsStringAsync(inboxPath(userId), await encryptUtf8(JSON.stringify(items)));
}

export async function mergeLegacyInbox(userId: string, incoming: LegacyInboxRow[]) {
  const existing = await readAll(userId);
  const byId = new Map(existing.map(row => [row.id, row]));
  for (const row of incoming) {
    if (!isRow(row)) continue;
    byId.set(row.id, row);
  }
  const next = [...byId.values()];
  await writeAll(userId, next);
  return next;
}

export async function listLegacyInbox(userId: string): Promise<LegacyInboxRow[]> {
  const now = Date.now();
  const items = await readAll(userId);
  const alive = items.filter(item => !item.expiresAt || new Date(item.expiresAt).getTime() > now);
  if (alive.length !== items.length) await writeAll(userId, alive);
  return alive;
}

export async function listLegacyInboxForConversation(userId: string, conversationId: string) {
  return (await listLegacyInbox(userId)).filter(row => row.conversationId === conversationId);
}

export async function wipeLegacyInbox(userId: string) {
  await FileSystem.deleteAsync(inboxPath(userId), { idempotent: true }).catch(() => undefined);
}

export async function wipeAllLegacyInboxes() {
  const root = FileSystem.documentDirectory;
  if (!root) return;
  const listing = await FileSystem.readDirectoryAsync(root).catch(() => []);
  await Promise.all(listing
    .filter(name => name.startsWith('nevula-legacy-inbox-') && name.endsWith('.json.enc'))
    .map(name => FileSystem.deleteAsync(`${root}${name}`, { idempotent: true }).catch(() => undefined)));
}
