// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { contactInviteUrl } from '../../shared/contactInvite';
import { contactTokenHash, decryptInviteContact, encryptInviteContact, newContactToken } from './contactInviteCrypto';
import { contactInviteTransport, type ContactInviteTransport } from './contactInviteTransport';
import type { PairingPayload } from './pairing';
import { encryptMessageV2 } from './messageCrypto';
import { packPairingIntro } from './pairingIntro';
import { readContactKeys, rememberContactKeys } from './contactKeys';
import { loadLocalContacts } from './localContacts';
import { hasOutgoingPairing, rememberOutgoingPairing } from './localPairing';
import { loadBlockedContacts } from './blockedContacts';
import { isVaultUnlocked } from './appLock';

const OWN = 'nevula.public.invite.v1';
const ATTEMPT = 'nevula.public.invite.attempt.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
function unlocked() { if (!isVaultUnlocked()) throw new Error('Unlock NEVULA to continue.'); }
export type InviteOptions = { expiresAt?: string | null; maxUses?: number | null };

export async function loadOwnContactInvite(userId: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(OWN);
  if (!raw) return null;
  try { const item = JSON.parse(raw); return item.owner === userId ? contactInviteUrl(item.token) : null; }
  catch { return null; }
}
export async function rotateContactInvite(identity: PairingPayload, limits: InviteOptions = {}, transport: ContactInviteTransport = contactInviteTransport) {
  unlocked();
  const token = newContactToken();
  const hash = await contactTokenHash(token);
  const envelope = await encryptInviteContact(token, identity);
  unlocked();
  await transport.call('rotate_contact_invite', { p_hash: hash, p_envelope: envelope, p_expires_at: limits.expiresAt ?? null, p_max_uses: limits.maxUses ?? null });
  await SecureStore.setItemAsync(OWN, JSON.stringify({ owner: identity.userId, token }), options);
  return contactInviteUrl(token);
}
export async function revokeContactInvite(transport: ContactInviteTransport = contactInviteTransport) {
  unlocked();
  await transport.call('revoke_contact_invite');
  await SecureStore.deleteItemAsync(OWN);
}
export async function resolveContactInvite(token: string, transport: ContactInviteTransport = contactInviteTransport) {
  unlocked();
  const envelope = await transport.call<string>('resolve_contact_invite', { p_hash: await contactTokenHash(token) });
  const contact = await decryptInviteContact(token, envelope);
  unlocked();
  return contact;
}

/** Confirmation is handled by the caller. The server atomically rechecks the
 * invitation and enqueues the SAME NVL2 intro consumed by existing messaging. */
export async function submitContactInvite(token: string, me: PairingPayload, peer: PairingPayload, transport: ContactInviteTransport = contactInviteTransport) {
  unlocked();
  if (peer.userId === me.userId) throw new Error('You cannot add yourself.');
  if ((await loadBlockedContacts(me.userId)).has(peer.userId)) throw new Error('Unblock this contact before sending a request.');
  const known = await readContactKeys(me.userId, peer.userId);
  if (known?.some(key => key.p256Spki && key.p256Spki !== peer.p256Spki)) {
    throw new Error('This contact has a different device key. Verify it in person before continuing.');
  }
  if (known?.some(key => key.kemPk && peer.kemPk && key.kemPk !== peer.kemPk)) {
    throw new Error('This contact has a different post-quantum key. Verify it in person before continuing.');
  }
  const outgoing = await hasOutgoingPairing(me.userId, peer.userId);
  if (!outgoing && (await loadLocalContacts(me.userId)).some(c => c.userId === peer.userId)) return 'connected' as const;
  const hash = await contactTokenHash(token);
  let attempt: { owner: string; hash: string; peer: string; id: string; ciphertext: string } | null = null;
  try { attempt = JSON.parse(await SecureStore.getItemAsync(ATTEMPT) ?? 'null'); } catch { /* replace invalid local record */ }
  if (!attempt || attempt.owner !== me.userId || attempt.hash !== hash || attempt.peer !== peer.userId) {
    attempt = { owner: me.userId, hash, peer: peer.userId, id: crypto.randomUUID(), ciphertext: await encryptMessageV2(packPairingIntro({
      v: 1, kind: 'intro', userId: me.userId, nevulaId: me.nevulaId, displayName: null, source: 'public_invite', kem: me.kemPk,
    }), [peer.p256Spki]) };
    await SecureStore.setItemAsync(ATTEMPT, JSON.stringify(attempt), options);
  }
  unlocked();
  const id = await transport.call<string>('submit_contact_invite', { p_hash: hash, p_id: attempt.id, p_ciphertext: attempt.ciphertext });
  await rememberContactKeys(me.userId, peer.userId, [{ p256Spki: peer.p256Spki, kemPk: peer.kemPk, fingerprint: peer.fingerprint }]);
  await rememberOutgoingPairing(me.userId, peer.userId, id);
  // Contact/chat appear only after the peer Accepts (intro-ack absorption).
  await SecureStore.deleteItemAsync(ATTEMPT);
  return 'sent' as const;
}
export async function wipeContactInvites() {
  await Promise.all([SecureStore.deleteItemAsync(OWN), SecureStore.deleteItemAsync(ATTEMPT)]);
}
