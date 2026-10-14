// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { ensurePgpIdentity } from './pgp';
import { ensureP256Keys } from './messageCrypto';
import { ensureKemKeys } from './pqKem';
import { wipeVerifiedContacts } from './verifiedContacts';
import { wipeLocalContacts } from './localContacts';
import { wipeOutgoingPairing } from './localPairing';
import { wipeOutbox } from './outbox';
import { wipeSealedInbox } from './sealedInbox';
import { retractOwnLegacyGraph } from './legacyGraph';
import { wipeLegacyInbox } from './legacyInbox';
import { legacyGraphImportedKey } from './legacyGraphRetract';
import { toSecureStoreKey } from './secureStoreKey';
import { wipePersonalDeleteKey } from './personalDeleteKey';
import { wipeBlockedContacts } from './blockedContacts';

const DEVICE_ID_KEY = 'nevula.device.id.v1';
const LOCAL_NEVULA_ID_PREFIX = 'nevula.local.id.v1';
const UI_NEVULA_ID_CACHE_KEY = 'nevula.ui.lastNevulaId.v1';
const NEVULA_ID_RE = /^NVL-[0-9A-F]{3}-[0-9A-F]{3}-[0-9A-F]{4}$/;
const UNPUBLISHED_FINGERPRINT = '0'.repeat(40);

/** Local slot name only. Not written to the server. */
export const PUBLISHED_DEVICE_SLOT = 'primary';

function makeNevulaId(): string {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `NVL-${hex.slice(0, 3)}-${hex.slice(3, 6)}-${hex.slice(6, 10)}`;
}

function localIdKey(userId: string) {
  return `${LOCAL_NEVULA_ID_PREFIX}.${userId}`;
}

export type NevulaIdentity = {
  userId: string;
  nevulaId: string;
  deviceId: string;
  fingerprint: string;
  p256Spki: string;
  kemPk: string;
};

/** Last resolved identity for instant UI (survives screen remounts in-process). */
let cachedIdentity: NevulaIdentity | null = null;

export function getCachedNevulaIdentity(): NevulaIdentity | null {
  return cachedIdentity;
}

/** Fast path for dashboard label — memory first, then last stored ID. */
export async function peekCachedNevulaId(): Promise<string | null> {
  if (cachedIdentity?.nevulaId) return cachedIdentity.nevulaId;
  const raw = await SecureStore.getItemAsync(UI_NEVULA_ID_CACHE_KEY).catch(() => null);
  return raw && NEVULA_ID_RE.test(raw) ? raw : null;
}

async function persistUiNevulaIdCache(nevulaId: string) {
  await SecureStore.setItemAsync(UI_NEVULA_ID_CACHE_KEY, nevulaId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }).catch(() => undefined);
}

export async function readLocalNevulaId(userId: string): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(localIdKey(userId));
  return stored && NEVULA_ID_RE.test(stored) ? stored : null;
}

async function persistLocalNevulaId(userId: string, nevulaId: string) {
  await SecureStore.setItemAsync(localIdKey(userId), nevulaId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function adoptRecoveredNevulaId(userId: string, nevulaId: string) {
  if (!NEVULA_ID_RE.test(nevulaId)) throw new Error('The recovered NEVULA ID is invalid.');
  await persistLocalNevulaId(userId, nevulaId);
}

async function adoptOwnPublishedNevulaId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('nevula_profiles')
    .select('nevula_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.nevula_id || !NEVULA_ID_RE.test(data.nevula_id)) return null;
  return data.nevula_id;
}

async function loadOrCreateLocalNevulaId(userId: string): Promise<string> {
  const existing = await readLocalNevulaId(userId);
  if (existing) return existing;
  const adopted = await adoptOwnPublishedNevulaId(userId);
  const nevulaId = adopted ?? makeNevulaId();
  await persistLocalNevulaId(userId, nevulaId);
  return nevulaId;
}

async function neutralizeOwnProfile(userId: string, keepLocalId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dummy = makeNevulaId();
    if (dummy === keepLocalId) continue;
    const { error } = await supabase
      .from('nevula_profiles')
      .update({ nevula_id: dummy, display_name: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (!error) return;
  }
}

async function neutralizeOwnDeviceKeys(userId: string) {
  await supabase
    .from('device_keys')
    .update({
      public_key_armored: 'unpublished',
      fingerprint: UNPUBLISHED_FINGERPRINT,
      algorithm: 'none',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/** Best-effort: drop or blank own directory rows. Sealed delivery does not need them. */
export async function retractPublishedDirectory(userId: string) {
  const localId = await loadOrCreateLocalNevulaId(userId);
  await supabase.from('device_keys').delete().eq('user_id', userId);
  await supabase.from('nevula_profiles').delete().eq('user_id', userId);
  const profileRes = await supabase
    .from('nevula_profiles')
    .select('nevula_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileRes.data?.nevula_id === localId) {
    await neutralizeOwnProfile(userId, localId);
  }
  const keysRes = await supabase
    .from('device_keys')
    .select('fingerprint')
    .eq('user_id', userId);
  if (keysRes.data?.some(row => row.fingerprint !== UNPUBLISHED_FINGERPRINT)) {
    await neutralizeOwnDeviceKeys(userId);
  }
  await retractOwnLegacyGraph(userId).catch(() => undefined);
}

export async function retractPublishedDirectoryIfSignedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  await retractPublishedDirectory(session.user.id);
}

export function watchPublishedDirectoryRetract() {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (!session?.user || event === 'TOKEN_REFRESHED') return;
    retractPublishedDirectory(session.user.id).catch(() => undefined);
  });
  return () => data.subscription.unsubscribe();
}

export async function ensureNevulaIdentity(): Promise<NevulaIdentity> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      const msg = error.message ?? 'Anonymous sign-in failed';
      throw new Error(
        /network|fetch|Failed to fetch|NevTOR/i.test(msg)
          ? `Could not reach NEVULA servers (${msg}). Turn NevTOR off and check internet.`
          : msg,
      );
    }
    session = data.session;
  }
  if (!session?.user) throw new Error('Could not create NEVULA identity.');

  const userId = session.user.id;
  const nevulaId = await loadOrCreateLocalNevulaId(userId);
  const pgp = await ensurePgpIdentity(nevulaId);
  const p256 = await ensureP256Keys();
  const kem = await ensureKemKeys();
  await retractPublishedDirectory(userId).catch(() => undefined);

  const identity: NevulaIdentity = {
    userId,
    nevulaId,
    deviceId: PUBLISHED_DEVICE_SLOT,
    fingerprint: pgp.fingerprint,
    p256Spki: p256.spkiB64,
    kemPk: kem.publicKeyB64,
  };
  cachedIdentity = identity;
  await persistUiNevulaIdCache(nevulaId);
  return identity;
}

export async function wipeIdentity() {
  cachedIdentity = null;
  await SecureStore.deleteItemAsync(UI_NEVULA_ID_CACHE_KEY).catch(() => undefined);
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await SecureStore.deleteItemAsync(toSecureStoreKey('nevula', 'retention', 'default', session.user.id)).catch(() => undefined);
    await SecureStore.deleteItemAsync(`nevula.hidden.messages.${session.user.id}`).catch(() => undefined);
    await SecureStore.deleteItemAsync(`nevula.contact.keys.${session.user.id}`).catch(() => undefined);
    await wipeVerifiedContacts(session.user.id);
    await SecureStore.deleteItemAsync(legacyGraphImportedKey(session.user.id)).catch(() => undefined);
    await wipeLegacyInbox(session.user.id);
    await wipeLocalContacts(session.user.id);
    await wipeOutgoingPairing(session.user.id);
    await wipeOutbox(session.user.id);
    await wipeSealedInbox(session.user.id);
    await wipeBlockedContacts(session.user.id);
    await SecureStore.deleteItemAsync(localIdKey(session.user.id)).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY).catch(() => undefined);
  await wipePersonalDeleteKey();
  // Local SecureStore clear only; server revoke is handled by prepareSessionTeardown
  // in wipeAllVaultData when possible. Keep a local sign-out as a final belt.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
