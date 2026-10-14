// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKey } from '../secureStoreKey';
import type { PeerNevTorCapability } from './capability';

type PeerMap = Record<string, PeerNevTorCapability>;

function storeKey(myUserId: string) {
  return toSecureStoreKey('nevula', 'nevtor', 'peers', myUserId);
}

async function readAll(myUserId: string): Promise<PeerMap> {
  const raw = await SecureStore.getItemAsync(storeKey(myUserId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PeerMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(myUserId: string, map: PeerMap) {
  await SecureStore.setItemAsync(storeKey(myUserId), JSON.stringify(map), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getPeerNevTorStatus(myUserId: string, peerUserId: string): Promise<PeerNevTorCapability | null> {
  const map = await readAll(myUserId);
  return map[peerUserId] ?? null;
}

export async function setPeerNevTorStatus(
  myUserId: string,
  peerUserId: string,
  status: PeerNevTorCapability,
): Promise<PeerNevTorCapability> {
  const map = await readAll(myUserId);
  const prev = map[peerUserId];
  if (prev && new Date(prev.updatedAt).getTime() > new Date(status.updatedAt).getTime()) {
    return prev;
  }
  map[peerUserId] = status;
  await writeAll(myUserId, map);
  return status;
}
