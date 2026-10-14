// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import type { NevulaIdentity } from './identity';
import { ensureNevulaIdentity } from './identity';
import { generateDeletionCode } from './deletionCode';

const PENDING_PREFIX = 'nevula.accountDeletion.pending.v1';

export const ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL ??
  process.env.EXPO_PUBLIC_DELETE_URL ??
  'https://nevula.de/delete';

function pendingKey(userId: string) {
  return `${PENDING_PREFIX}.${userId}`;
}

async function registerCode(identity: NevulaIdentity, deletionCode: string) {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: {
      action: 'register',
      nevulaId: identity.nevulaId,
      deletionCode,
    },
  });
  if (error) throw new Error('Could not register the deletion code securely.');
}

export async function createDeletionCode(identity: NevulaIdentity) {
  const existing = await SecureStore.getItemAsync(pendingKey(identity.userId));
  if (existing) {
    await registerCode(identity, existing).catch(() => undefined);
    return existing;
  }
  const deletionCode = generateDeletionCode();
  await SecureStore.setItemAsync(pendingKey(identity.userId), deletionCode, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  // Do not block first-time setup if the edge function is unreachable — code stays local and can register later.
  await registerCode(identity, deletionCode).catch(() => undefined);
  return deletionCode;
}

export async function resumePendingDeletionSetup() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const pending = await SecureStore.getItemAsync(pendingKey(session.user.id));
  if (!pending) return null;
  const identity = await ensureNevulaIdentity();
  await registerCode(identity, pending);
  return { userId: identity.userId, nevulaId: identity.nevulaId, deletionCode: pending };
}

export async function acknowledgeDeletionCode(userId: string) {
  await SecureStore.deleteItemAsync(pendingKey(userId));
}

export async function deleteSignedInAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No NEVULA account is signed in.');
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { action: 'delete_session' },
  });
  if (error) throw new Error('Account deletion could not be completed.');
}
