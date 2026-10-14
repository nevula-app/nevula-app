// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKey } from '../secureStoreKey';

type FlagMap = Record<string, { required: boolean; updatedAt: string }>;

function myKey(myUserId: string) {
  return toSecureStoreKey('nevula', 'nevtor', 'chatreq', 'mine', myUserId);
}

function peerKey(myUserId: string) {
  return toSecureStoreKey('nevula', 'nevtor', 'chatreq', 'peer', myUserId);
}

async function readMap(key: string): Promise<FlagMap> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FlagMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(key: string, map: FlagMap) {
  await SecureStore.setItemAsync(key, JSON.stringify(map), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Either side can require NevTOR for the chat. */
export function chatRequiresNevTor(mine: boolean, peer: boolean) {
  return mine || peer;
}

/**
 * Keys are conversationIds (preferred). Legacy peerUserId keys still resolve for
 * the default 1:1 conversation when callers pass a peer id as conversationKey.
 */
export async function getMyChatNevTorRequire(myUserId: string, conversationKey: string): Promise<boolean> {
  const map = await readMap(myKey(myUserId));
  return map[conversationKey]?.required === true;
}

/** True once the user has answered the one-time Orbot prompt for this conversation. */
export async function hasMyChatNevTorDecision(myUserId: string, conversationKey: string): Promise<boolean> {
  const map = await readMap(myKey(myUserId));
  return Object.prototype.hasOwnProperty.call(map, conversationKey);
}

export async function getPeerChatNevTorRequire(myUserId: string, conversationKey: string): Promise<boolean> {
  const map = await readMap(peerKey(myUserId));
  return map[conversationKey]?.required === true;
}

/** Conversations where either side requires NevTOR. */
export async function listChatNevTorRequiredKeys(myUserId: string): Promise<Set<string>> {
  const [mine, peer] = await Promise.all([readMap(myKey(myUserId)), readMap(peerKey(myUserId))]);
  const out = new Set<string>();
  for (const [id, flag] of Object.entries(mine)) {
    if (flag?.required) out.add(id);
  }
  for (const [id, flag] of Object.entries(peer)) {
    if (flag?.required) out.add(id);
  }
  return out;
}

/** @deprecated Prefer listChatNevTorRequiredKeys — kept for callers that still track peer ids. */
export async function listChatNevTorRequiredPeers(myUserId: string): Promise<Set<string>> {
  return listChatNevTorRequiredKeys(myUserId);
}

export async function setMyChatNevTorRequire(
  myUserId: string,
  conversationKey: string,
  required: boolean,
): Promise<void> {
  const map = await readMap(myKey(myUserId));
  const previous = map[conversationKey];
  // Once Tor was chosen for this chat, do not allow unlocking from this device.
  if (previous?.required === true && required === false) {
    return;
  }
  map[conversationKey] = { required, updatedAt: new Date().toISOString() };
  await writeMap(myKey(myUserId), map);
}

export async function setPeerChatNevTorRequire(
  myUserId: string,
  conversationKey: string,
  required: boolean,
  updatedAt: string,
): Promise<void> {
  const map = await readMap(peerKey(myUserId));
  const prev = map[conversationKey];
  // Peer Tor requirement stays locked once confirmed.
  if (prev?.required === true && required === false) return;
  if (prev && new Date(prev.updatedAt).getTime() > new Date(updatedAt).getTime()) return;
  map[conversationKey] = { required, updatedAt };
  await writeMap(peerKey(myUserId), map);
}

export async function wipeChatNevTorRequires() {
  // Keys are per-user; wipe path clears via identity wipe of SecureStore namespaces where possible.
  // Callers that know userId should clear explicitly; this is a no-op placeholder for full wipe hooks.
}
