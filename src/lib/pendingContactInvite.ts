// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { INVITE_TOKEN_RE } from '../../shared/contactInvite';
const KEY = 'nevula.pending.contact.invite.v1';
export async function savePendingContactInvite(token: string) {
  if (!INVITE_TOKEN_RE.test(token)) return;
  await SecureStore.setItemAsync(KEY, JSON.stringify({ token, until: Date.now() + 7 * 86400000 }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function loadPendingContactInvite(): Promise<string | null> {
  try {
    const item = JSON.parse(await SecureStore.getItemAsync(KEY) ?? 'null');
    if (item && item.until > Date.now() && INVITE_TOKEN_RE.test(item.token)) return item.token;
  } catch { /* invalid/expired pending invitation */ }
  await clearPendingContactInvite();
  return null;
}
export async function clearPendingContactInvite() { await SecureStore.deleteItemAsync(KEY); }
