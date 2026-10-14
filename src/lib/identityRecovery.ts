// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import * as openpgp from 'openpgp';
import { adoptRecoveredNevulaId, ensureNevulaIdentity, type NevulaIdentity } from './identity';
import { replaceLocalContacts } from './localContacts';
import { supabase } from './supabase';

const RECOVERY_STORE_KEY = 'nevula.identity.recovery.v1';
const RECOVERY_ID_RE = /^NVR(-[A-F0-9]{4}){6}$/;

export type IdentityRecoveryCredentials = {
  recoveryId: string;
  recoveryKey: string;
};

type RecoveryPayload = {
  v: 1;
  nevulaId: string;
  contacts: unknown[];
};

function randomHex(byteCount: number) {
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function createRecoveryId() {
  return `NVR-${randomHex(12).match(/.{4}/g)!.join('-')}`;
}

function createRecoveryKey() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `NVRK-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function recoveryEmail(recoveryId: string) {
  return `${recoveryId.replace(/-/g, '').toLowerCase()}@recover.nevula.invalid`;
}

async function encryptPayload(payload: RecoveryPayload, recoveryKey: string) {
  const message = await openpgp.createMessage({ text: JSON.stringify(payload) });
  return openpgp.encrypt({ message, passwords: [recoveryKey], format: 'armored' }) as Promise<string>;
}

async function decryptPayload(encrypted: string, recoveryKey: string): Promise<RecoveryPayload> {
  const message = await openpgp.readMessage({ armoredMessage: encrypted });
  const result = await openpgp.decrypt({ message, passwords: [recoveryKey], format: 'utf8' });
  const payload = JSON.parse(result.data as string) as RecoveryPayload;
  if (payload.v !== 1 || !Array.isArray(payload.contacts) || !/^NVL-/.test(payload.nevulaId)) {
    throw new Error('The recovery backup is invalid.');
  }
  return payload;
}

async function saveCredentials(credentials: IdentityRecoveryCredentials) {
  await SecureStore.setItemAsync(RECOVERY_STORE_KEY, JSON.stringify(credentials), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadIdentityRecoveryCredentials(): Promise<IdentityRecoveryCredentials | null> {
  const stored = await SecureStore.getItemAsync(RECOVERY_STORE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as IdentityRecoveryCredentials;
    return RECOVERY_ID_RE.test(parsed.recoveryId) && parsed.recoveryKey.startsWith('NVRK-') ? parsed : null;
  } catch {
    return null;
  }
}

export async function wipeIdentityRecoveryCredentials() {
  await SecureStore.deleteItemAsync(RECOVERY_STORE_KEY);
}

async function payloadFor(identity: NevulaIdentity, recoveryKey: string) {
  // ID-only recovery: never upload the contact list (privacy §12 / product intent).
  return encryptPayload({ v: 1, nevulaId: identity.nevulaId, contacts: [] }, recoveryKey);
}

export async function ensureIdentityRecovery(identity?: NevulaIdentity) {
  const currentIdentity = identity ?? await ensureNevulaIdentity();
  const existing = await loadIdentityRecoveryCredentials();
  if (existing) {
    await syncIdentityRecoveryBackup(currentIdentity).catch(() => undefined);
    return existing;
  }
  const credentials = { recoveryId: createRecoveryId(), recoveryKey: createRecoveryKey() };
  // Always keep seeds on-device first so setup can finish offline / if the edge function is down.
  await saveCredentials(credentials);
  try {
    const encryptedContacts = await payloadFor(currentIdentity, credentials.recoveryKey);
    const { error } = await supabase.functions.invoke('identity-recovery', {
      body: { ...credentials, encryptedContacts },
    });
    if (error) {
      // Local seeds remain; Settings → Recovery can retry backup later.
      console.warn('identity-recovery activate deferred:', error.message ?? error);
    }
  } catch (cause) {
    console.warn('identity-recovery activate deferred:', cause);
  }
  return credentials;
}

export async function syncIdentityRecoveryBackup(identity?: NevulaIdentity) {
  const credentials = await loadIdentityRecoveryCredentials();
  if (!credentials) return;
  const currentIdentity = identity ?? await ensureNevulaIdentity();
  const encryptedContacts = await payloadFor(currentIdentity, credentials.recoveryKey);
  const { error } = await supabase.from('identity_recovery_backups').update({
    encrypted_contacts: encryptedContacts,
    updated_at: new Date().toISOString(),
  }).eq('user_id', currentIdentity.userId);
  if (error) throw error;
}

export async function recoverIdentity(credentials: IdentityRecoveryCredentials) {
  const recoveryId = credentials.recoveryId.trim().toUpperCase();
  const recoveryKey = credentials.recoveryKey.trim().toUpperCase();
  if (!RECOVERY_ID_RE.test(recoveryId) || !/^NVRK-[A-F0-9]{64}$/.test(recoveryKey)) {
    throw new Error('Enter a valid Recovery ID and Recovery Key.');
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: recoveryEmail(recoveryId),
    password: recoveryKey,
  });
  if (authError || !auth.user) throw new Error('Recovery ID or Recovery Key is incorrect.');
  const { data, error } = await supabase.from('identity_recovery_backups')
    .select('encrypted_contacts')
    .eq('user_id', auth.user.id)
    .single();
  if (error || !data?.encrypted_contacts) throw new Error('The recovery backup is unavailable.');
  const payload = await decryptPayload(data.encrypted_contacts, recoveryKey);
  await adoptRecoveredNevulaId(auth.user.id, payload.nevulaId);
  // Contacts in older backups are discarded — recovery restores NEVULA ID only.
  await replaceLocalContacts(auth.user.id, []);
  await saveCredentials({ recoveryId, recoveryKey });
  const identity = await ensureNevulaIdentity();
  return { identity, restoredContacts: 0 };
}
