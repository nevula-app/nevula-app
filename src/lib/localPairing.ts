// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { PAIRING_INTRO_MS } from './pairingIntro';

type OutgoingEntry = { id: string; sentAt: string; ids?: string[] };
type OutgoingMap = Record<string, OutgoingEntry>;

function storeKey(userId: string) {
  return `nevula.pairing.out.${userId}`;
}

async function loadMap(userId: string): Promise<OutgoingMap> {
  const raw = await SecureStore.getItemAsync(storeKey(userId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as OutgoingMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMap(userId: string, map: OutgoingMap) {
  await SecureStore.setItemAsync(storeKey(userId), JSON.stringify(map), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function rememberOutgoingPairing(userId: string, peerUserId: string, blobId: string) {
  const map = await loadMap(userId);
  const prev = map[peerUserId];
  const ids = [...new Set([...(prev?.ids ?? []), ...(prev?.id ? [prev.id] : []), blobId])];
  map[peerUserId] = { id: blobId, ids, sentAt: new Date().toISOString() };
  await saveMap(userId, map);
}

export async function listOutgoingPairings(userId: string): Promise<Array<{ peerUserId: string; id: string; ids: string[]; sentAt: string }>> {
  const map = await loadMap(userId);
  const now = Date.now();
  let changed = false;
  const rows: Array<{ peerUserId: string; id: string; ids: string[]; sentAt: string }> = [];
  for (const [peerUserId, row] of Object.entries(map)) {
    if (now - new Date(row.sentAt).getTime() > PAIRING_INTRO_MS) {
      delete map[peerUserId];
      changed = true;
      continue;
    }
    const ids = [...new Set([...(row.ids ?? []), row.id].filter(id => Boolean(id)))];
    rows.push({ peerUserId, id: row.id, ids, sentAt: row.sentAt });
  }
  if (changed) await saveMap(userId, map);
  return rows;
}

export async function hasOutgoingPairing(userId: string, peerUserId: string) {
  const map = await loadMap(userId);
  const row = map[peerUserId];
  if (!row) return false;
  if (Date.now() - new Date(row.sentAt).getTime() > PAIRING_INTRO_MS) {
    delete map[peerUserId];
    await saveMap(userId, map);
    return false;
  }
  return true;
}

export async function clearOutgoingPairing(userId: string, peerUserId: string) {
  const map = await loadMap(userId);
  if (!map[peerUserId]) return;
  delete map[peerUserId];
  await saveMap(userId, map);
}

export async function wipeOutgoingPairing(userId: string) {
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
}
