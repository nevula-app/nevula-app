// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const STORAGE_KEY = 'nevula.personal.delete.key.v1';

function formatKey(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
  return `${chars.slice(0,5)}-${chars.slice(5,10)}-${chars.slice(10,15)}-${chars.slice(15,20)}`;
}

export async function ensurePersonalDeleteKey(userId: string, nevulaId: string) {
  let key = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!key) {
    const bytes = new Uint8Array(20);
    globalThis.crypto.getRandomValues(bytes);
    key = formatKey(bytes);
    await SecureStore.setItemAsync(STORAGE_KEY, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  // Registration is best-effort — never block first-time setup if the edge function is down.
  await supabase.functions.invoke('delete-account', { body: { action: 'register', nevulaId, deletionCode: key } }).catch(() => undefined);
  return key;
}

export async function loadPersonalDeleteKey() { return SecureStore.getItemAsync(STORAGE_KEY); }
export async function wipePersonalDeleteKey() { await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => undefined); }
