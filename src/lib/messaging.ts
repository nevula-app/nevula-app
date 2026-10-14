// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { decryptFromSender, getLocalPublicArmored } from './pgp';
import { decryptMessageV2, encryptMessageV2, ensureP256Keys, isV2Ciphertext, NVL3_PREFIX, parsePublishedDeviceKey, readV2SenderSpki } from './messageCrypto';
import { ensureKemKeys, REPAIR_KEM_ERROR } from './pqKem';
import { decryptNvl3, encryptNvl3, isNvl3Ciphertext, PeerKeyChangedError, readNvl3Envelope, SessionRollbackError, resetRatchetSession } from './sessionRatchet';
import { sortInboxOldestFirst } from './inboxOrder';
import { mergeContactKey, readContactKeys, rememberContactKeys } from './contactKeys';
import { loadLocalContacts, localConversationId, saveLocalContact } from './localContacts';
import { clearOutgoingPairing, hasOutgoingPairing, rememberOutgoingPairing } from './localPairing';
import { PAIRING_INTRO_MS, packPairingIntro, parsePairingIntro, type PairingIntro, type PairingTrust } from './pairingIntro';
import { appendOutbox, listOutboxForPeer, listOutboxForConversation, removeOutboxMessage } from './outbox';
import { hasSealedInboxMessage, listSealedInboxForPeer, listSealedInboxForConversation, listSealedInboxIds, mergeSealedInbox } from './sealedInbox';
import { isMissingFunction, isMissingRelation, PEER_KEY_UNAVAILABLE, SEALED_DELIVERY_UNAVAILABLE } from './sealedDelivery';
import { ensureNevulaIdentity, readLocalNevulaId } from './identity';
import { retractOwnLegacyGraph } from './legacyGraph';
import { legacyGraphImportedKey } from './legacyGraphRetract';
import { listLegacyInboxForConversation } from './legacyInbox';
import { toSecureStoreKey } from './secureStoreKey';
import { isNevTorCapabilityPlaintext, tryParseNevTorCapability, tryParseChatNevTorRequire } from './nevtor/capability';
import { applyIncomingAvatar, isAvatarPlaintext } from './profileAvatar';
import { setPeerNevTorStatus } from './nevtor/peerStatus';
import { setMyChatNevTorRequire, setPeerChatNevTorRequire } from './nevtor/chatRequire';
import { markContactVerified } from './verifiedContacts';
import {
  addMembersToThread,
  clearPendingThreadMember,
  defaultDmConversationId,
  getChatThread,
  listChatThreads,
  markThreadConfirmed,
  removeChatThread,
  threadWriteReady,
  upsertChatThread,
  type ChatThread,
  type PendingMemberIntro,
} from './chatThreads';
import {
  encodeThreadConfirm,
  encodeThreadInvite,
  encodeThreadLeave,
  isThreadControlPlaintext,
  tryParseThreadControl,
  unwrapThreadPlaintext,
  wrapThreadPlaintext,
  type ThreadMemberIntro,
} from './threadEnvelope';

export type ContactRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
  senderNevulaId?: string;
  source?: 'public_invite';
  /** Sender already verified the peer (QR / pairing link) — accepter should show Trusted too. */
  trust?: PairingTrust;
};

export type Contact = {
  userId: string;
  nevulaId: string;
  displayName: string | null;
  conversationId: string;
  legacyConversationId?: string;
};

/** One row in the Messages list — default DM, extra DM thread, or group. */
export type ChatListItem = {
  conversationId: string;
  kind: 'dm' | 'group';
  /** Primary peer for DM; empty for groups (use memberIds). */
  userId: string;
  memberIds: string[];
  nevulaId: string;
  displayName: string | null;
  title: string | null;
  torRequired: boolean;
  writeReady: boolean;
  pendingConfirms: number;
  /** Members waiting for local key/contact confirmation after a group invite. */
  pendingMemberIds: string[];
  pendingMemberLabels?: Record<string, string>;
  /** Extra DM / group: all members must confirm before writing. */
  strictConfirm: boolean;
  legacyConversationId?: string;
};

export type DecryptedMessage = {
  id: string;
  senderId: string;
  plaintext: string;
  createdAt: string;
  expiresAt: string | null;
  /** Local UI only — not persisted. pending/sent/failed for outbound. */
  delivery?: 'pending' | 'sent' | 'failed';
};

export type RetentionUnit = 'minutes' | 'hours' | 'days';
export type RetentionSetting = { value: number; unit: RetentionUnit };

export const DEFAULT_RETENTION: RetentionSetting = { value: 24, unit: 'hours' };
export const MAX_RETENTION_MS = 28 * 24 * 60 * 60 * 1000;

function defaultRetentionKey(userId: string) {
  return toSecureStoreKey('nevula', 'retention', 'default', userId);
}
function chatRetentionKey(userId: string, conversationId: string) {
  // conversationId is `nvl3:a:b` — colons are illegal in SecureStore keys.
  return toSecureStoreKey('nevula', 'retention', 'chat', userId, conversationId);
}

function isMissingRetentionTable(error: any) {
  return isMissingRelation(error);
}

async function readLocalRetention(key: string): Promise<RetentionSetting | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try { return normalizeRetention(JSON.parse(raw)); } catch { return null; }
}

export function retentionToMs(setting: RetentionSetting) {
  const multiplier = setting.unit === 'minutes' ? 60_000 : setting.unit === 'hours' ? 3_600_000 : 86_400_000;
  return Math.min(MAX_RETENTION_MS, Math.max(1, Math.floor(setting.value)) * multiplier);
}

export function normalizeRetention(setting: RetentionSetting): RetentionSetting {
  const value = Math.max(1, Math.floor(Number(setting.value) || 1));
  const max = setting.unit === 'minutes' ? 40_320 : setting.unit === 'hours' ? 672 : 28;
  return { unit: setting.unit, value: Math.min(value, max) };
}

async function forgetServerRetention(userId: string) {
  const { error } = await supabase.from('message_retention_defaults').delete().eq('user_id', userId);
  if (error && !isMissingRetentionTable(error) && error.code !== '42501') {
    // Leftover preference row may already be gone or writes revoked.
  }
}

export async function getDefaultRetention(userId: string): Promise<RetentionSetting> {
  await forgetServerRetention(userId);
  return (await readLocalRetention(defaultRetentionKey(userId))) ?? DEFAULT_RETENTION;
}

export async function setDefaultRetention(userId: string, setting: RetentionSetting) {
  const next = normalizeRetention(setting);
  await SecureStore.setItemAsync(defaultRetentionKey(userId), JSON.stringify(next));
  await forgetServerRetention(userId);
  return next;
}

export async function getConversationRetention(userId: string, conversationId: string): Promise<RetentionSetting | null> {
  return readLocalRetention(chatRetentionKey(userId, conversationId));
}

export async function setConversationRetention(userId: string, conversationId: string, setting: RetentionSetting | null) {
  if (!setting) {
    await SecureStore.deleteItemAsync(chatRetentionKey(userId, conversationId));
    return;
  }
  await SecureStore.setItemAsync(chatRetentionKey(userId, conversationId), JSON.stringify(normalizeRetention(setting)));
}

async function myUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

type ProfileRow = { user_id: string; nevula_id: string; display_name: string | null };

export async function findUserByNevulaId(nevulaId: string) {
  const me = await myUserId();
  if (!me) return null;
  const needle = nevulaId.trim().toUpperCase();
  const hit = (await loadLocalContacts(me)).find(contact => contact.nevulaId === needle);
  if (!hit) return null;
  return { user_id: hit.userId, nevula_id: hit.nevulaId, display_name: hit.displayName } satisfies ProfileRow;
}

export async function getProfileByUserId(userId: string) {
  const me = await myUserId();
  if (me === userId) {
    const nevulaId = await readLocalNevulaId(userId);
    if (!nevulaId) return null;
    return { user_id: userId, nevula_id: nevulaId, display_name: null } satisfies ProfileRow;
  }
  if (me) {
    const local = (await loadLocalContacts(me)).find(contact => contact.userId === userId);
    if (local) {
      return { user_id: local.userId, nevula_id: local.nevulaId, display_name: local.displayName } satisfies ProfileRow;
    }
  }
  return null;
}

function asSyntheticRequest(params: {
  id: string;
  senderId: string;
  receiverId: string;
  status: ContactRequest['status'];
}): ContactRequest {
  const now = new Date().toISOString();
  return {
    id: params.id,
    sender_id: params.senderId,
    receiver_id: params.receiverId,
    status: params.status,
    created_at: now,
    updated_at: now,
  };
}

async function deletePairingBlob(blobId: string, recipientId: string) {
  const { error } = await supabase.from('message_blobs').delete().eq('id', blobId).eq('recipient_id', recipientId);
  if (error && !isMissingRelation(error)) throw error;
}

async function sendSealedPairing(params: {
  senderId: string;
  recipientUserId: string;
  kind: PairingIntro['kind'];
  source?: PairingIntro['source'];
  trust?: PairingTrust;
  /** Prefer QR / invite SPKI when the peer has not published keys yet. */
  peerSpki?: string;
  rechat?: true;
  conversationId?: string;
  tor?: boolean;
}): Promise<string> {
  const [me, recipientKeys, kem] = await Promise.all([
    getProfileByUserId(params.senderId),
    getActivePublicKeys(params.recipientUserId).catch(() => []),
    ensureKemKeys(),
  ]);
  const peerSpki =
    params.peerSpki
    || recipientKeys.map(key => key.p256Spki).find((value): value is string => Boolean(value));
  if (!peerSpki) throw new Error(PEER_KEY_UNAVAILABLE);
  const ciphertext = await encryptMessageV2(packPairingIntro({
    v: 1,
    kind: params.kind,
    userId: params.senderId,
    nevulaId: me?.nevula_id ?? 'Unknown',
    displayName: me?.display_name ?? null,
    ...(params.source === 'public_invite' ? { source: params.source } : {}),
    ...(params.trust ? { trust: params.trust } : {}),
    ...(params.rechat && params.conversationId ? { rechat: true as const, conversationId: params.conversationId, tor: params.tor === true } : {}),
    kem: kem.publicKeyB64,
  }), [peerSpki]);
  const id = globalThis.crypto.randomUUID();
  const { error } = await supabase.from('message_blobs').insert({
    id,
    recipient_id: params.recipientUserId,
    ciphertext,
    expires_at: new Date(Date.now() + PAIRING_INTRO_MS).toISOString(),
  });
  if (error) {
    if (isMissingRelation(error)) throw new Error(SEALED_DELIVERY_UNAVAILABLE);
    throw error;
  }
  return id;
}

async function listLeftoverPairingRows(senderId: string, receiverId: string): Promise<ContactRequest[]> {
  const pairFilter = `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`;
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .or(pairFilter)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []) as ContactRequest[];
}

async function listSealedPairing(myUserId: string): Promise<Array<{ id: string; intro: PairingIntro }>> {
  const { data, error } = await supabase
    .from('message_blobs')
    .select('id,ciphertext')
    .eq('recipient_id', myUserId)
    .not('ciphertext', 'like', `${NVL3_PREFIX}%`);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  const found: Array<{ id: string; intro: PairingIntro }> = [];
  for (const row of data ?? []) {
    if (!isV2Ciphertext(row.ciphertext)) continue;
    try {
      const intro = parsePairingIntro(await decryptMessageV2(row.ciphertext));
      if (!intro || intro.userId === myUserId) continue;
      const senderSpki = readV2SenderSpki(row.ciphertext);
      if (!senderSpki) continue;
      const cached = await readContactKeys(myUserId, intro.userId);
      const known = (cached ?? []).map(key => key.p256Spki).filter((value): value is string => Boolean(value));
      if (known.length && !known.includes(senderSpki)) continue;
      const hasKem = Boolean(cached?.some(key => key.kemPk));
      if (!known.length || (intro.kem && !hasKem)) {
        await mergeContactKey(myUserId, intro.userId, {
          p256Spki: senderSpki,
          kemPk: intro.kem ?? null,
        }).catch(() => undefined);
      }
      found.push({ id: row.id, intro });
    } catch {
      // Chat blob or not a pairing envelope.
    }
  }
  return found;
}

async function rememberLocalPeer(
  currentUserId: string,
  contactUserId: string,
  known?: { nevulaId?: string; displayName?: string | null },
) {
  const profile = await getProfileByUserId(contactUserId);
  await saveLocalContact(currentUserId, {
    userId: contactUserId,
    nevulaId: profile?.nevula_id ?? known?.nevulaId ?? 'Unknown',
    displayName: profile?.display_name ?? known?.displayName ?? null,
    conversationId: localConversationId(currentUserId, contactUserId),
  });
}

async function absorbPairingAck(
  currentUserId: string,
  peerUserId: string,
  blobId?: string,
  known?: { nevulaId?: string; displayName?: string | null; trust?: PairingTrust },
) {
  await rememberLocalPeer(currentUserId, peerUserId, known);
  await clearOutgoingPairing(currentUserId, peerUserId);
  // Only apply Trusted when the peer explicitly signaled trust (QR / pairing-link Accept).
  // Public-invite acks omit trust and must not create a checkmark.
  if (known?.trust === 'in_person' || known?.trust === 'key') {
    await markContactVerified(currentUserId, peerUserId, known.trust).catch(() => undefined);
  }
  if (blobId) await deletePairingBlob(blobId, currentUserId).catch(() => undefined);
}

export async function sendContactRequest(
  senderId: string,
  receiverId: string,
  opts?: { trust?: PairingTrust; source?: 'public_invite'; peerSpki?: string },
) {
  if (senderId === receiverId) throw new Error('You cannot add your own NEVULA ID.');
  const trust = opts?.trust;
  const peerSpki = opts?.peerSpki;

  const local = await loadLocalContacts(senderId);
  const outgoing = await hasOutgoingPairing(senderId, receiverId);
  if (local.some(contact => contact.userId === receiverId) && !outgoing) {
    // Already contacts — still apply one-sided Trusted from this QR/link scan and
    // push an intro-ack so the other phone also shows the checkmark (no re-scan needed).
    if (trust) {
      await markContactVerified(senderId, receiverId, trust);
      await sendSealedPairing({
        senderId,
        recipientUserId: receiverId,
        kind: 'intro-ack',
        trust,
        peerSpki,
      }).catch(() => undefined);
    }
    return { request: asSyntheticRequest({ id: localConversationId(senderId, receiverId), senderId, receiverId, status: 'accepted' }), outcome: 'already_connected' as const };
  }

  const inbox = await listSealedPairing(senderId);
  const incoming = inbox.find(item => item.intro.kind === 'intro' && item.intro.userId === receiverId);
  if (incoming) {
    await absorbPairingAck(senderId, receiverId, incoming.id, {
      nevulaId: incoming.intro.nevulaId,
      displayName: incoming.intro.displayName,
      trust: trust ?? incoming.intro.trust ?? 'in_person',
    });
    await sendSealedPairing({
      senderId,
      recipientUserId: receiverId,
      kind: 'intro-ack',
      trust: trust ?? 'in_person',
      peerSpki,
    }).catch(() => undefined);
    return { request: asSyntheticRequest({ id: incoming.id, senderId: receiverId, receiverId: senderId, status: 'accepted' }), outcome: 'accepted' as const };
  }

  if (outgoing) {
    // Pending request already out — keep trust on this phone; peer still must Accept.
    if (trust) await markContactVerified(senderId, receiverId, trust).catch(() => undefined);
    return { request: asSyntheticRequest({ id: `out:${receiverId}`, senderId, receiverId, status: 'pending' }), outcome: 'already_sent' as const };
  }

  const leftover = await listLeftoverPairingRows(senderId, receiverId);
  const incomingPending = leftover.find(row => row.sender_id === receiverId && row.receiver_id === senderId && row.status === 'pending');
  if (incomingPending) {
    const accepted = await respondToContactRequest(incomingPending.id, 'accepted');
    await createConversationWith(receiverId, senderId);
    await markContactVerified(senderId, receiverId, trust ?? 'in_person').catch(() => undefined);
    await sendSealedPairing({
      senderId,
      recipientUserId: receiverId,
      kind: 'intro-ack',
      trust: trust ?? 'in_person',
      peerSpki,
    }).catch(() => undefined);
    return { request: accepted ?? asSyntheticRequest({ id: incomingPending.id, senderId: receiverId, receiverId: senderId, status: 'accepted' }), outcome: 'accepted' as const };
  }

  const outgoingPending = leftover.find(row => row.sender_id === senderId && row.receiver_id === receiverId && row.status === 'pending');
  if (outgoingPending) {
    if (trust) await markContactVerified(senderId, receiverId, trust).catch(() => undefined);
    return { request: outgoingPending, outcome: 'already_sent' as const };
  }

  const alreadyAccepted = leftover.find(row => row.status === 'accepted');
  if (alreadyAccepted) {
    await createConversationWith(receiverId, senderId);
    if (trust) {
      await markContactVerified(senderId, receiverId, trust);
      await sendSealedPairing({
        senderId,
        recipientUserId: receiverId,
        kind: 'intro-ack',
        trust,
        peerSpki,
      }).catch(() => undefined);
    }
    return { request: alreadyAccepted, outcome: 'already_connected' as const };
  }

  const blobId = await sendSealedPairing({
    senderId,
    recipientUserId: receiverId,
    kind: 'intro',
    source: opts?.source,
    trust,
    peerSpki,
  });
  await rememberOutgoingPairing(senderId, receiverId, blobId);
  // Scanner keeps Trusted immediately; peer gets it when they Accept (+ ack back).
  if (trust) await markContactVerified(senderId, receiverId, trust).catch(() => undefined);
  return { request: asSyntheticRequest({ id: blobId, senderId, receiverId, status: 'pending' }), outcome: 'sent' as const };
}

async function materializeRechatThread(myUserId: string, intro: PairingIntro) {
  if (!intro.rechat || !intro.conversationId) return;
  const { unhideChatFromList } = await import('./chatListPrefs');
  await unhideChatFromList(myUserId, intro.conversationId);
  const keys = await readContactKeys(myUserId, intro.userId);
  const spki = keys?.map(key => key.p256Spki).find((value): value is string => Boolean(value));
  const kem = intro.kem ?? keys?.map(key => key.kemPk).find((value): value is string => Boolean(value));
  const existing = await getChatThread(myUserId, intro.conversationId);
  await upsertChatThread(myUserId, {
    conversationId: intro.conversationId,
    kind: 'dm',
    memberIds: [intro.userId],
    title: existing?.title ?? null,
    torRequired: intro.tor === true,
    confirmations: {
      ...(existing?.confirmations ?? {}),
      [intro.userId]: true,
      ...(intro.tor ? {} : { [myUserId]: true }),
    },
    pendingMembers: {
      ...(existing?.pendingMembers ?? {}),
      [intro.userId]: {
        nevulaId: intro.nevulaId,
        displayName: intro.displayName,
        ...(spki ? { p256Spki: spki } : {}),
        ...(kem ? { kemPk: kem } : {}),
        fromUserId: intro.userId,
      },
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

export async function listContactRequests(userId: string) {
  const sealed = await listSealedPairing(userId);
  for (const item of sealed.filter(entry => entry.intro.kind === 'intro-ack')) {
    await absorbPairingAck(userId, item.intro.userId, item.id, {
      nevulaId: item.intro.nevulaId,
      displayName: item.intro.displayName,
      trust: item.intro.trust,
    });
  }

  const declines: Array<{ peerId: string; nevulaId: string; blobId: string }> = [];
  for (const item of sealed.filter(entry => entry.intro.kind === 'intro-decline')) {
    await clearOutgoingPairing(userId, item.intro.userId).catch(() => undefined);
    await deletePairingBlob(item.id, userId).catch(() => undefined);
    declines.push({ peerId: item.intro.userId, nevulaId: item.intro.nevulaId, blobId: item.id });
  }

  const local = await loadLocalContacts(userId);
  const known = new Set(local.map(contact => contact.userId));
  const { loadBlockedContacts } = await import('./blockedContacts');
  const blocked = await loadBlockedContacts(userId).catch(() => new Set<string>());
  const intros = sealed.filter(item => item.intro.kind === 'intro');
  for (const item of intros) {
    if (known.has(item.intro.userId) || blocked.has(item.intro.userId)) {
      if (item.intro.rechat) await deletePairingBlob(item.id, userId).catch(() => undefined);
    } else if (item.intro.rechat && item.intro.conversationId) {
      await materializeRechatThread(userId, item.intro).catch(() => undefined);
    }
  }
  const pending = intros
    .filter(item => !known.has(item.intro.userId) && !blocked.has(item.intro.userId) && !(item.intro.rechat && known.has(item.intro.userId)))
    .map(item => ({
      ...asSyntheticRequest({
        id: item.id,
        senderId: item.intro.userId,
        receiverId: userId,
        status: 'pending' as const,
      }),
      senderNevulaId: item.intro.nevulaId,
      source: item.intro.source,
      trust: item.intro.trust,
      ...(item.intro.rechat && item.intro.conversationId
        ? { rechat: true as const, conversationId: item.intro.conversationId, tor: item.intro.tor === true }
        : {}),
    }));

  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingRelation(error)) return { pending, declines };
    throw error;
  }

  const leftover = ((data ?? []) as ContactRequest[]).filter(row => {
    const peerId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    return row.status === 'pending' && !known.has(peerId) && !pending.some(item => item.sender_id === peerId || item.receiver_id === peerId);
  });
  return { pending: [...pending, ...leftover], declines };
}

export async function sendPairingAck(senderId: string, recipientUserId: string, trust?: PairingTrust) {
  await sendSealedPairing({
    senderId,
    recipientUserId,
    kind: 'intro-ack',
    // Only attach trust when the accepter verified (QR/key). Public invites omit it
    // so the peer does not get a Verified mark they never earned.
    ...(trust ? { trust } : {}),
  });
}

export async function sendPairingDecline(senderId: string, recipientUserId: string) {
  await sendSealedPairing({
    senderId,
    recipientUserId,
    kind: 'intro-decline',
  });
}

export async function cancelOutgoingContactRequest(myUserId: string, peerUserId: string) {
  const { listOutgoingPairings } = await import('./localPairing');
  const rows = await listOutgoingPairings(myUserId);
  const row = rows.find(item => item.peerUserId === peerUserId);
  const ids = (row?.ids ?? []).filter(id => id && !id.startsWith('out:'));
  for (const id of ids) {
    const { error } = await supabase.rpc('delete_message_blob', { p_id: id });
    if (error && !isMissingRelation(error) && !isMissingFunction(error)) throw error;
  }
  const { error: reqError } = await supabase
    .from('contact_requests')
    .delete()
    .eq('sender_id', myUserId)
    .eq('receiver_id', peerUserId)
    .eq('status', 'pending');
  if (reqError && !isMissingRelation(reqError)) throw reqError;
  await clearOutgoingPairing(myUserId, peerUserId);
}

export async function dismissIncomingContactRequest(requestId: string) {
  const { error: blobError } = await supabase.rpc('delete_message_blob', { p_id: requestId });
  if (blobError && !isMissingRelation(blobError) && !isMissingFunction(blobError)) throw blobError;
  const { error: reqError } = await supabase.from('contact_requests').delete().eq('id', requestId);
  if (reqError && !isMissingRelation(reqError)) throw reqError;
}

export async function respondToContactRequest(requestId: string, status: 'accepted' | 'declined') {
  const { data: deleted, error: blobError } = await supabase
    .from('message_blobs')
    .delete()
    .eq('id', requestId)
    .select('id');
  if (!blobError && deleted?.length) return asSyntheticRequest({ id: requestId, senderId: '', receiverId: '', status });

  const { data, error } = await supabase
    .from('contact_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as ContactRequest | null;
}

export async function createConversationWith(
  contactUserId: string,
  currentUserId: string,
  known?: { nevulaId?: string; displayName?: string | null },
) {
  await rememberLocalPeer(currentUserId, contactUserId, known);
  await clearOutgoingPairing(currentUserId, contactUserId);
  const conversationId = localConversationId(currentUserId, contactUserId);
  try {
    await supabase
      .from('contact_requests')
      .delete()
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${contactUserId}),and(sender_id.eq.${contactUserId},receiver_id.eq.${currentUserId})`);
  } catch {
    // Pairing row may already be gone or the delete policy not yet applied.
  }
  return conversationId;
}

async function importLegacyGraphOnce(currentUserId: string) {
  const flag = legacyGraphImportedKey(currentUserId);
  if (await SecureStore.getItemAsync(flag)) return;
  const { data: memberships, error } = await supabase
    .from('conversation_members')
    .select('conversation_id,user_id');
  if (error) {
    if (!isMissingRelation(error)) throw error;
    await SecureStore.setItemAsync(flag, '1', { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return;
  }

  const grouped = new Map<string, Set<string>>();
  for (const row of memberships ?? []) {
    const members = grouped.get(row.conversation_id) ?? new Set<string>();
    members.add(row.user_id);
    grouped.set(row.conversation_id, members);
  }
  const peerIds = new Set<string>();
  const legacyByPeer = new Map<string, string>();
  for (const [legacyId, members] of grouped) {
    if (!members.has(currentUserId)) continue;
    for (const peerId of members) {
      if (peerId === currentUserId) continue;
      peerIds.add(peerId);
      if (!legacyByPeer.has(peerId)) legacyByPeer.set(peerId, legacyId);
    }
  }

  if (peerIds.size) {
    for (const peerId of peerIds) {
      const profile = await getProfileByUserId(peerId);
      await saveLocalContact(currentUserId, {
        userId: peerId,
        nevulaId: profile?.nevula_id ?? 'Unknown',
        displayName: profile?.display_name ?? null,
        conversationId: localConversationId(currentUserId, peerId),
        legacyConversationId: legacyByPeer.get(peerId),
      });
    }
  }

  await SecureStore.setItemAsync(flag, '1', { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function listContacts(currentUserId: string): Promise<Contact[]> {
  await importLegacyGraphOnce(currentUserId);
  // Legacy retract hits the network. Do not block opening an already paired chat on it.
  void retractOwnLegacyGraph(currentUserId).catch(() => undefined);
  const local = await loadLocalContacts(currentUserId);
  return local.map(contact => ({
    userId: contact.userId,
    nevulaId: contact.nevulaId,
    displayName: contact.displayName,
    conversationId: localConversationId(currentUserId, contact.userId),
    legacyConversationId: contact.legacyConversationId,
  }));
}

function asPublishedKeys(rows: Array<{ public_key_armored?: string | null; fingerprint?: string | null; p256Spki?: string | null; kemPk?: string | null }>) {
  return rows.map(row => {
    const parsed = parsePublishedDeviceKey(row.public_key_armored);
    return {
      public_key_armored: parsed.pgp || row.public_key_armored || '',
      fingerprint: row.fingerprint ?? '',
      p256Spki: row.p256Spki ?? parsed.p256Spki,
      kemPk: row.kemPk ?? null,
    };
  });
}

export async function getActivePublicKeys(userId: string) {
  const me = await myUserId();
  if (me && me !== userId) {
    const cached = await readContactKeys(me, userId);
    if (cached?.some(key => key.p256Spki)) return asPublishedKeys(cached);
  }

  if (me === userId) {
    const [local, kem] = await Promise.all([ensureP256Keys(), ensureKemKeys()]);
    return asPublishedKeys([{ p256Spki: local.spkiB64, kemPk: kem.publicKeyB64 }]);
  }

  throw new Error(PEER_KEY_UNAVAILABLE);
}

export async function sendEncryptedMessage(params: {
  conversationId: string;
  senderId: string;
  recipientUserId: string;
  plaintext: string;
  expiresAt: string;
  /** Capability / control blobs stay out of the local chat outbox. */
  skipOutbox?: boolean;
  /** Stable id for retries — never mint a second blob for the same send. */
  messageId?: string;
}) {
  if (!params.skipOutbox && (await hasOutgoingPairing(params.senderId, params.recipientUserId))) {
    throw new Error('Waiting for them to Accept your contact request before you can send messages.');
  }
  const recipientKeys = await getActivePublicKeys(params.recipientUserId);
  const peerSpki = recipientKeys.map(key => key.p256Spki).find((value): value is string => Boolean(value));
  const peerKemPk = recipientKeys.map(key => key.kemPk).find((value): value is string => Boolean(value));
  if (!peerSpki) {
    throw new Error(PEER_KEY_UNAVAILABLE);
  }
  if (!peerKemPk) throw new Error(REPAIR_KEM_ERROR);
  const defaultCid = defaultDmConversationId(params.senderId, params.recipientUserId);
  const isControl =
    isNevTorCapabilityPlaintext(params.plaintext) || isThreadControlPlaintext(params.plaintext) || isAvatarPlaintext(params.plaintext);
  const wirePlaintext =
    isControl || params.conversationId === defaultCid
      ? params.plaintext
      : wrapThreadPlaintext(params.conversationId, params.plaintext);
  const messageId = params.messageId && /^[0-9a-f-]{36}$/i.test(params.messageId)
    ? params.messageId
    : globalThis.crypto.randomUUID();
  const sentAt = new Date().toISOString();
  const ciphertext = await encryptNvl3({
    myUserId: params.senderId,
    peerUserId: params.recipientUserId,
    peerIdentitySpki: peerSpki,
    peerKemPk,
    plaintext: wirePlaintext,
    sentAt,
  }).catch((error: unknown) => {
    if (error instanceof PeerKeyChangedError) {
      throw new Error('This contact’s device key changed. Open the chat, accept the new key, then send again.');
    }
    if (error instanceof SessionRollbackError) {
      throw new Error('The secure session on this phone looks inconsistent. Accept a key reset in the chat, then try again.');
    }
    throw error;
  });
  const { error } = await supabase.from('message_blobs').insert({
    id: messageId,
    recipient_id: params.recipientUserId,
    ciphertext,
    expires_at: params.expiresAt,
  });
  if (error) {
    // Idempotent retry: blob already exists from a successful first attempt.
    const dup = /duplicate|unique|already exists/i.test(`${error.message ?? ''} ${error.code ?? ''}`);
    if (!dup) {
      if (isMissingRelation(error)) throw new Error(SEALED_DELIVERY_UNAVAILABLE);
      throw error;
    }
  }
  const skipOutbox = params.skipOutbox || isNevTorCapabilityPlaintext(params.plaintext) || isThreadControlPlaintext(params.plaintext) || isAvatarPlaintext(params.plaintext);
  if (!skipOutbox) {
    await appendOutbox(params.senderId, {
      id: messageId,
      peerUserId: params.recipientUserId,
      plaintext: params.plaintext,
      createdAt: sentAt,
      expiresAt: params.expiresAt,
      conversationId: params.conversationId,
    });
    // Remote FCM wake for the recipient (Calculator text only — never ciphertext).
    void import('./remotePush')
      .then(({ requestRemoteMessagePush }) => requestRemoteMessagePush(params.recipientUserId))
      .catch(() => undefined);
  }
  return { id: messageId, sender_id: params.senderId, created_at: sentAt, expires_at: params.expiresAt };
}

/** Sealed profile picture for accepted contacts. Ciphertext only; the blob is deleted after open. */
export async function publishProfileAvatar(myUserId: string, plaintext: string) {
  const contacts = await loadLocalContacts(myUserId);
  if (!contacts.length) return { sent: 0, failed: 0 };
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  let failed = 0;
  for (const contact of contacts) {
    try {
      await sendEncryptedMessage({
        conversationId: defaultDmConversationId(myUserId, contact.userId),
        senderId: myUserId,
        recipientUserId: contact.userId,
        plaintext,
        expiresAt,
        skipOutbox: true,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

/** Fan-out a plaintext to every other member of a thread (groups / multi-recipient). */
export async function sendEncryptedThreadMessage(params: {
  conversationId: string;
  senderId: string;
  memberIds: string[];
  plaintext: string;
  expiresAt: string;
  skipOutbox?: boolean;
}) {
  const recipients = [...new Set(params.memberIds.filter(id => id && id !== params.senderId))];
  if (!recipients.length) throw new Error('No recipients for this chat.');
  const thread = await getChatThread(params.senderId, params.conversationId);
  const pending = thread?.pendingMembers ?? {};
  const blocked = recipients.filter(id => Boolean(pending[id]));
  if (blocked.length && !params.skipOutbox) {
    throw new Error(
      'Confirm the new person in this chat first (key / contact). Until then the group cannot message together.',
    );
  }
  let last: { id: string; sender_id: string; created_at: string; expires_at: string } | null = null;
  const failures: string[] = [];
  for (const recipientUserId of recipients) {
    try {
      last = await sendEncryptedMessage({
        conversationId: params.conversationId,
        senderId: params.senderId,
        recipientUserId,
        plaintext: params.plaintext,
        expiresAt: params.expiresAt,
        skipOutbox: params.skipOutbox,
      });
    } catch (error: any) {
      const msg = String(error?.message ?? error ?? 'send failed');
      failures.push(msg.includes(PEER_KEY_UNAVAILABLE) || /no local encryption key/i.test(msg)
        ? 'missing key — confirm them in this chat or scan their QR'
        : msg);
    }
  }
  if (!last) {
    throw new Error(
      failures.length
        ? `Could not deliver in this group (${failures[0]}).`
        : 'Could not deliver in this group.',
    );
  }
  if (failures.length) {
    throw new Error(
      `Message reached some people, but not everyone (${failures[0]}). Confirm missing contacts, then send again.`,
    );
  }
  return last;
}

async function buildThreadMemberIntros(senderId: string, memberIds: string[]): Promise<ThreadMemberIntro[]> {
  const contacts = await loadLocalContacts(senderId);
  const byId = new Map(contacts.map(c => [c.userId, c]));
  const me = await ensureNevulaIdentity().catch(() => null);
  const intros: ThreadMemberIntro[] = [];
  for (const id of [...new Set(memberIds)]) {
    if (me && id === me.userId) {
      intros.push({
        id: me.userId,
        n: me.nevulaId,
        d: null,
        k: me.p256Spki,
        f: me.fingerprint,
        q: me.kemPk,
      });
      continue;
    }
    const contact = byId.get(id);
    const keys = await readContactKeys(senderId, id);
    const spki = keys?.map(k => k.p256Spki).find((v): v is string => Boolean(v));
    const fp = keys?.map(k => k.fingerprint).find((v): v is string => Boolean(v));
    const kem = keys?.map(k => k.kemPk).find((v): v is string => Boolean(v));
    if (!contact && !spki) continue;
    intros.push({
      id,
      n: contact?.nevulaId ?? 'Unknown',
      d: contact?.displayName ?? null,
      ...(spki ? { k: spki } : {}),
      ...(fp ? { f: fp } : {}),
      ...(kem ? { q: kem } : {}),
    });
  }
  return intros;
}

export async function announceThreadInvite(params: {
  thread: ChatThread;
  senderId: string;
  /** If set, only these peers get the invite blob (new joiners). */
  onlyMemberIds?: string[];
}) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const members = [params.senderId, ...params.thread.memberIds];
  const recipients = params.onlyMemberIds?.length
    ? params.onlyMemberIds.filter(id => id !== params.senderId)
    : params.thread.memberIds;
  if (!recipients.length) return;
  const intros = await buildThreadMemberIntros(params.senderId, members);
  const plaintext = encodeThreadInvite({
    c: params.thread.conversationId,
    kind: params.thread.kind === 'group' || members.length > 2 ? 'group' : params.thread.kind,
    members,
    tor: params.thread.torRequired ? 1 : 0,
    title: params.thread.title,
    from: params.senderId,
    ...(intros.length ? { intros } : {}),
  });
  const failures: string[] = [];
  for (const recipientUserId of recipients) {
    try {
      await sendEncryptedMessage({
        conversationId: params.thread.conversationId,
        senderId: params.senderId,
        recipientUserId,
        plaintext,
        expiresAt,
        skipOutbox: true,
      });
      await sendEncryptedMessage({
        conversationId: params.thread.conversationId,
        senderId: params.senderId,
        recipientUserId,
        plaintext: (await import('./nevtor/capability')).encodeChatNevTorRequire(
          params.thread.torRequired,
          new Date().toISOString(),
          params.thread.conversationId,
        ),
        expiresAt,
        skipOutbox: true,
      });
    } catch (error: any) {
      failures.push(String(error?.message ?? 'invite failed'));
    }
    // Readable without the old contact keys, so a phone that deleted this
    // contact still gets a request inside the chat.
    await sendSealedPairing({
      senderId: params.senderId,
      recipientUserId,
      kind: 'intro',
      rechat: true,
      conversationId: params.thread.conversationId,
      tor: params.thread.torRequired,
    }).catch(() => undefined);
  }
  await setMyChatNevTorRequire(params.senderId, params.thread.conversationId, params.thread.torRequired);
  if (failures.length === recipients.length) {
    throw new Error(failures[0] || 'Could not deliver the group invite.');
  }
}

/**
 * Leave / delete a conversation on this device and tell peers so they hide it too.
 * Other chats with the same partner (e.g. normal + Tor) stay.
 */
export async function leaveChatThread(params: {
  myUserId: string;
  conversationId: string;
  memberIds: string[];
}) {
  const { hideChatFromList } = await import('./chatListPrefs');
  await hideChatFromList(params.myUserId, params.conversationId);
  await removeChatThread(params.myUserId, params.conversationId);

  const recipients = [...new Set(params.memberIds.filter(id => id && id !== params.myUserId))];
  if (!recipients.length) return;

  const plaintext = encodeThreadLeave({
    c: params.conversationId,
    from: params.myUserId,
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await Promise.allSettled(
    recipients.map(recipientUserId =>
      sendEncryptedMessage({
        conversationId: params.conversationId,
        senderId: params.myUserId,
        recipientUserId,
        plaintext,
        expiresAt,
        skipOutbox: true,
      }),
    ),
  );
}

/** Invite contacts into an open chat. 1:1 becomes a group when a third person joins. */
export async function inviteToChat(params: {
  myUserId: string;
  conversationId: string;
  inviteeIds: string[];
  seedPeerUserId?: string;
  torRequired?: boolean;
  title?: string | null;
}) {
  const local = await loadLocalContacts(params.myUserId);
  const known = new Set(local.map(c => c.userId));
  const inviteeIds = [...new Set(params.inviteeIds.filter(id => id && id !== params.myUserId))];
  if (!inviteeIds.length) throw new Error('Pick at least one contact to invite.');
  const unknown = inviteeIds.filter(id => !known.has(id));
  if (unknown.length) {
    throw new Error('You can only invite people from your contact list.');
  }
  const { thread, addedIds } = await addMembersToThread({
    myUserId: params.myUserId,
    conversationId: params.conversationId,
    addMemberIds: inviteeIds,
    seed: params.seedPeerUserId
      ? {
          peerUserId: params.seedPeerUserId,
          torRequired: params.torRequired === true,
          title: params.title ?? null,
        }
      : undefined,
  });
  if (!addedIds.length) return thread;
  // Tell existing members the roster grew (same invite payload with key intros).
  const existing = thread.memberIds.filter(id => !addedIds.includes(id));
  if (existing.length) {
    await announceThreadInvite({ thread, senderId: params.myUserId, onlyMemberIds: existing });
  }
  await announceThreadInvite({ thread, senderId: params.myUserId, onlyMemberIds: addedIds });
  return thread;
}

/** Confirm a member announced in a group invite — stores contact + device key locally. */
export async function confirmPendingThreadMember(params: {
  myUserId: string;
  conversationId: string;
  memberId: string;
}) {
  const thread = await getChatThread(params.myUserId, params.conversationId);
  const pending = thread?.pendingMembers?.[params.memberId];
  if (!pending) throw new Error('Nothing to confirm for this person.');
  if (!pending.p256Spki || !pending.kemPk) {
    throw new Error('No post-quantum device key was included. Scan their pairing QR in person, then try again.');
  }
  await rememberContactKeys(params.myUserId, params.memberId, [{
    p256Spki: pending.p256Spki,
    kemPk: pending.kemPk,
    fingerprint: pending.fingerprint ?? null,
  }]);
  await saveLocalContact(params.myUserId, {
    userId: params.memberId,
    nevulaId: pending.nevulaId || 'Unknown',
    displayName: pending.displayName,
    conversationId: localConversationId(params.myUserId, params.memberId),
  });
  await markContactVerified(params.myUserId, params.memberId, 'key').catch(() => undefined);
  await clearPendingThreadMember(params.myUserId, params.conversationId, params.memberId);
  return getChatThread(params.myUserId, params.conversationId);
}

export async function confirmThreadMembership(params: {
  myUserId: string;
  conversationId: string;
}) {
  const thread = await getChatThread(params.myUserId, params.conversationId);
  if (!thread) throw new Error('Chat not found.');
  await markThreadConfirmed(params.myUserId, params.conversationId, params.myUserId);
  await setMyChatNevTorRequire(params.myUserId, params.conversationId, thread.torRequired);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await sendEncryptedThreadMessage({
    conversationId: params.conversationId,
    senderId: params.myUserId,
    memberIds: thread.memberIds,
    plaintext: encodeThreadConfirm({ c: params.conversationId, from: params.myUserId }),
    expiresAt,
    skipOutbox: true,
  });
  await sendEncryptedThreadMessage({
    conversationId: params.conversationId,
    senderId: params.myUserId,
    memberIds: thread.memberIds,
    plaintext: (await import('./nevtor/capability')).encodeChatNevTorRequire(
      thread.torRequired,
      new Date().toISOString(),
      params.conversationId,
    ),
    expiresAt,
    skipOutbox: true,
  });
  return getChatThread(params.myUserId, params.conversationId);
}

export async function listChatListItems(currentUserId: string): Promise<ChatListItem[]> {
  const contacts = await listContacts(currentUserId);
  const byUser = new Map(contacts.map(c => [c.userId, c]));
  const threads = await listChatThreads(currentUserId);
  const items: ChatListItem[] = [];

  // Contact confirmation must NOT invent a chat. Only list default DMs that already exist
  // (created when the user opens New chat / first intentional thread).
  for (const contact of contacts) {
    const defaultId = defaultDmConversationId(currentUserId, contact.userId);
    const thread = threads.find(t => t.conversationId === defaultId);
    if (!thread) continue;
    // Promoted to group via invite — shown once in the threads loop below.
    if (thread.kind === 'group' || thread.memberIds.length > 1) continue;
    items.push({
      conversationId: thread.conversationId,
      kind: 'dm',
      userId: contact.userId,
      memberIds: [contact.userId],
      nevulaId: contact.nevulaId,
      displayName: contact.displayName,
      title: null,
      torRequired: thread.torRequired,
      writeReady: true,
      pendingConfirms: 0,
      pendingMemberIds: Object.keys(thread.pendingMembers ?? {}),
      pendingMemberLabels: Object.fromEntries(
        Object.entries(thread.pendingMembers ?? {}).map(([id, row]) => [
          id,
          row.displayName?.trim() || row.nevulaId || 'New member',
        ]),
      ),
      strictConfirm: false,
      legacyConversationId: contact.legacyConversationId,
    });
  }

  for (const thread of threads) {
    const primaryPeer = thread.memberIds[0];
    const isDefaultDm = thread.kind === 'dm'
      && thread.memberIds.length === 1
      && Boolean(primaryPeer)
      && thread.conversationId === defaultDmConversationId(currentUserId, primaryPeer!);
    if (isDefaultDm) continue;
    const pending = thread.torRequired
      ? [currentUserId, ...thread.memberIds].filter(id => thread.confirmations[id] !== true).length
      : 0;
    const ready = !thread.torRequired || threadWriteReady(thread, currentUserId);
    const pendingMemberIds = Object.keys(thread.pendingMembers ?? {});
    const pendingMemberLabels = Object.fromEntries(
      Object.entries(thread.pendingMembers ?? {}).map(([id, row]) => [
        id,
        byUser.get(id)?.displayName
          || byUser.get(id)?.nevulaId
          || row.displayName?.trim()
          || row.nevulaId
          || 'New member',
      ]),
    );
    if (thread.kind === 'dm' && thread.memberIds.length === 1) {
      if (!primaryPeer) continue;
      const contact = byUser.get(primaryPeer);
      const pendingIntro = thread.pendingMembers?.[primaryPeer];
      if (!contact && !pendingIntro) continue;
      items.push({
        conversationId: thread.conversationId,
        kind: 'dm',
        userId: primaryPeer,
        memberIds: [primaryPeer],
        nevulaId: contact?.nevulaId || pendingIntro?.nevulaId || 'Unknown',
        displayName: contact?.displayName ?? pendingIntro?.displayName ?? null,
        title: null,
        torRequired: thread.torRequired,
        writeReady: Boolean(contact) && ready,
        pendingConfirms: pending,
        pendingMemberIds,
        pendingMemberLabels,
        strictConfirm: thread.torRequired || !contact,
      });
      continue;
    }
    const labels = thread.memberIds.map(id => {
      const pendingIntro = thread.pendingMembers?.[id];
      return byUser.get(id)?.displayName
        || byUser.get(id)?.nevulaId
        || pendingIntro?.displayName
        || pendingIntro?.nevulaId
        || '…';
    });
    items.push({
      conversationId: thread.conversationId,
      kind: 'group',
      userId: '',
      memberIds: thread.memberIds,
      nevulaId: thread.title || 'Group',
      displayName: thread.title,
      title: thread.title || labels.slice(0, 3).join(', '),
      torRequired: thread.torRequired,
      writeReady: ready,
      pendingConfirms: pending,
      pendingMemberIds,
      pendingMemberLabels,
      strictConfirm: thread.torRequired,
    });
  }

  return dedupeDmChatListItems(items);
}

/** At most one clear DM and one Tor DM per contact in the list. */
function dedupeDmChatListItems(items: ChatListItem[]): ChatListItem[] {
  const seen = new Set<string>();
  const out: ChatListItem[] = [];
  for (const item of items) {
    if (item.kind !== 'dm' || !item.userId) {
      out.push(item);
      continue;
    }
    const key = `${item.userId}:${item.torRequired ? 'tor' : 'clear'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function deleteEncryptedMessageForEveryone(messageId: string, senderId: string) {
  const { error: blobError } = await supabase.rpc('delete_message_blob', { p_id: messageId });
  if (!blobError) {
    await removeOutboxMessage(senderId, messageId);
    return;
  }
  if (!isMissingRelation(blobError) && !isMissingFunction(blobError)) {
    throw blobError;
  }
  const { data, error } = await supabase
    .from('encrypted_messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', senderId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Delete for everyone is not enabled on the server yet.');
  await removeOutboxMessage(senderId, messageId);
}

export async function decryptStoredMessage(message: { ciphertext: string; sender_id: string }) {
  if (isNvl3Ciphertext(message.ciphertext)) {
    throw new Error('This message needs the sealed chat key.');
  }
  if (isV2Ciphertext(message.ciphertext)) {
    return decryptMessageV2(message.ciphertext);
  }
  const [senderKeys, localPublic] = await Promise.all([
    getActivePublicKeys(message.sender_id).catch(() => []),
    getLocalPublicArmored(),
  ]);
  return decryptFromSender(
    typeof message.ciphertext === 'string' ? message.ciphertext : String(message.ciphertext ?? ''),
    [...senderKeys.map(key => key.public_key_armored).filter((value): value is string => Boolean(value)), localPublic],
  );
}

async function deleteOwnBlob(blobId: string, recipientId: string) {
  const { error } = await supabase.from('message_blobs').delete().eq('id', blobId).eq('recipient_id', recipientId);
  if (error && !isMissingRelation(error)) throw error;
}

async function purgeExpiredOwnBlobs(myUserId: string) {
  const { error } = await supabase
    .from('message_blobs')
    .delete()
    .eq('recipient_id', myUserId)
    .lte('expires_at', new Date().toISOString());
  if (error && !isMissingRelation(error)) throw error;
}

async function persistOpenedBlob(params: {
  myUserId: string;
  peerUserId: string;
  blobId: string;
  body: string;
  sentAt: string;
  expiresAt: string | null;
}) {
  const defaultCid = defaultDmConversationId(params.myUserId, params.peerUserId);
  const { conversationId, body } = unwrapThreadPlaintext(params.body, defaultCid);
  const serverExp = params.expiresAt ? new Date(params.expiresAt).getTime() : NaN;
  const floor = Date.now() + 60 * 60 * 1000;
  const expiresAt = Number.isFinite(serverExp)
    ? new Date(Math.max(serverExp, floor)).toISOString()
    : new Date(Date.now() + MAX_RETENTION_MS).toISOString();
  await mergeSealedInbox(params.myUserId, {
    id: params.blobId,
    peerUserId: params.peerUserId,
    plaintext: body,
    createdAt: params.sentAt,
    expiresAt,
    conversationId,
  });
  await deleteOwnBlob(params.blobId, params.myUserId);
  if (!isNevTorCapabilityPlaintext(body) && !isThreadControlPlaintext(body) && !isAvatarPlaintext(body)) {
    const { noteInAppUnreadMessage } = await import('./inAppUnread');
    await noteInAppUnreadMessage(params.blobId, params.peerUserId, conversationId).catch(() => undefined);
    // OS alert only for real chat plaintext — never for capability/control blobs.
    const { notifyNewInboundChatMessage } = await import('./messageAlerts');
    await notifyNewInboundChatMessage(params.peerUserId, params.blobId);
  }
}

async function applyThreadControl(params: {
  myUserId: string;
  peerUserId: string;
  body: string;
}) {
  const control = tryParseThreadControl(params.body);
  if (!control) return false;
  if (control.k === 'thread_invite') {
    const existing = await getChatThread(params.myUserId, control.c);
    const others = control.members.filter(id => id !== params.myUserId);
    const memberIds = [...new Set([...(existing?.memberIds ?? []), ...others])];
    const kind = memberIds.length > 1 ? 'group' : (control.kind === 'group' ? 'group' : 'dm');
    const torRequired = control.tor === 1;
    const confirmations: Record<string, boolean> = {
      ...(existing?.confirmations ?? {}),
      [control.from]: true,
    };
    // Clear chat: normal entry — join immediately. Tor chat: wait for explicit confirm.
    if (!torRequired) {
      confirmations[params.myUserId] = true;
    }

    const knownContacts = new Set((await loadLocalContacts(params.myUserId)).map(c => c.userId));
    const pendingMembers: Record<string, PendingMemberIntro> = { ...(existing?.pendingMembers ?? {}) };
    for (const intro of control.intros ?? []) {
      if (!intro.id || intro.id === params.myUserId) continue;
      const cachedKeys = await readContactKeys(params.myUserId, intro.id);
      const hasKey = Boolean(cachedKeys?.some(k => k.p256Spki));
      const hasKem = Boolean(cachedKeys?.some(k => k.kemPk));
      if (intro.q && !hasKem) {
        await mergeContactKey(params.myUserId, intro.id, {
          p256Spki: intro.k,
          kemPk: intro.q,
          fingerprint: intro.f,
        }).catch(() => undefined);
      }
      if (knownContacts.has(intro.id) && hasKey && (hasKem || intro.q)) {
        delete pendingMembers[intro.id];
        continue;
      }
      if (!intro.k && !intro.n) continue;
      pendingMembers[intro.id] = {
        nevulaId: intro.n || 'Unknown',
        displayName: intro.d ?? null,
        p256Spki: intro.k,
        kemPk: intro.q,
        fingerprint: intro.f,
        fromUserId: control.from,
      };
    }
    // Unknown roster ids without intros still need attention.
    for (const id of memberIds) {
      if (id === params.myUserId || knownContacts.has(id) || pendingMembers[id]) continue;
      pendingMembers[id] = {
        nevulaId: 'Unknown',
        displayName: null,
        fromUserId: control.from,
      };
    }

    await upsertChatThread(params.myUserId, {
      conversationId: control.c,
      kind,
      memberIds,
      title: control.title ?? existing?.title ?? null,
      torRequired,
      confirmations,
      pendingMembers: Object.keys(pendingMembers).length ? pendingMembers : undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    await setPeerChatNevTorRequire(
      params.myUserId,
      control.c,
      torRequired,
      new Date().toISOString(),
    );
    if (!torRequired) {
      await setMyChatNevTorRequire(params.myUserId, control.c, false);
    }
    return true;
  }
  if (control.k === 'thread_leave') {
    // Peer deleted/left this conversation — remove locally so it disappears on both sides.
    await removeChatThread(params.myUserId, control.c);
    const { hideChatFromList } = await import('./chatListPrefs');
    await hideChatFromList(params.myUserId, control.c).catch(() => undefined);
    return true;
  }
  await markThreadConfirmed(params.myUserId, control.c, control.from);
  return true;
}

async function openNvl3Blob(params: {
  myUserId: string;
  peerUserId: string;
  peerIdentitySpki: string;
  ciphertext: string;
  allowHeal: boolean;
}): Promise<{ body: string; sentAt: string } | 'already' | null> {
  try {
    return await decryptNvl3({
      myUserId: params.myUserId,
      peerUserId: params.peerUserId,
      peerIdentitySpki: params.peerIdentitySpki,
      ciphertext: params.ciphertext,
    });
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    if (/already opened/i.test(msg)) return 'already';
    if (!params.allowHeal) return null;
    // After a history wipe / desync, drop local ratchet once and retry from the envelope.
    await resetRatchetSession(params.myUserId, params.peerUserId).catch(() => undefined);
    try {
      return await decryptNvl3({
        myUserId: params.myUserId,
        peerUserId: params.peerUserId,
        peerIdentitySpki: params.peerIdentitySpki,
        ciphertext: params.ciphertext,
      });
    } catch (retryError: any) {
      if (/already opened/i.test(String(retryError?.message ?? ''))) return 'already';
      return null;
    }
  }
}

export async function consumeSealedChatBlobs(
  myUserId: string,
  preferPeerId?: string,
  opts?: { peerOnly?: boolean },
) {
  await purgeExpiredOwnBlobs(myUserId).catch(() => undefined);
  const contacts = await loadLocalContacts(myUserId);
  // Pairing intros remember the sender SPKI even before Accept — include them so
  // group invites are not dropped while the contact request is still pending.
  const sealedPairing = await listSealedPairing(myUserId).catch(() => []);
  const peerRows = new Map<string, { userId: string; nevulaId: string }>();
  for (const contact of contacts) {
    peerRows.set(contact.userId, { userId: contact.userId, nevulaId: contact.nevulaId });
  }
  for (const item of sealedPairing) {
    if (!peerRows.has(item.intro.userId)) {
      peerRows.set(item.intro.userId, { userId: item.intro.userId, nevulaId: item.intro.nevulaId });
    }
  }
  if (!peerRows.size) return;
  const peerOnly = opts?.peerOnly === true && Boolean(preferPeerId);
  const allPeers = [...peerRows.values()];
  const ordered = peerOnly
    ? allPeers.filter(peer => peer.userId === preferPeerId)
    : preferPeerId
      ? [
          ...allPeers.filter(peer => peer.userId === preferPeerId),
          ...allPeers.filter(peer => peer.userId !== preferPeerId),
        ]
      : allPeers;
  if (!ordered.length) return;

  // Resolve paired device keys once — do not abort the whole inbox on a single miss.
  const spkiByPeer = new Map<string, string>();
  for (const peer of ordered) {
    const peerKeys = await getActivePublicKeys(peer.userId).catch(() => []);
    const peerSpki = peerKeys.map(key => key.p256Spki).find((value): value is string => Boolean(value));
    if (peerSpki) spkiByPeer.set(peer.userId, peerSpki);
  }
  if (peerOnly && preferPeerId && !spkiByPeer.has(preferPeerId)) {
    // Still list local sealed inbox; nothing new can be opened without the pairing key.
    return;
  }

  // A Tor-stalled inbox read must not hold the consume chain.
  const listed = await Promise.race([
    supabase
      .from('message_blobs')
      .select('id,ciphertext,expires_at')
      .eq('recipient_id', myUserId)
      .like('ciphertext', `${NVL3_PREFIX}%`)
      .order('expires_at', { ascending: true }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('inbox-timeout')), 8_000);
    }),
  ]);
  const { data: blobs, error } = listed;
  if (error) {
    if (isMissingRelation(error)) return;
    throw error;
  }

  const blockedChains = new Set<string>();
  const inboxRows = sortInboxOldestFirst((blobs ?? []).map(row => {
    let chainId: string | null = null;
    let chainCounter = Number.POSITIVE_INFINITY;
    try {
      const envelope = readNvl3Envelope(row.ciphertext);
      chainId = envelope.dh;
      chainCounter = envelope.n;
    } catch {
      chainId = null;
    }
    return { ...row, chainId, chainCounter };
  }));

  for (const row of inboxRows) {
    if (!isNvl3Ciphertext(row.ciphertext)) continue;
    const chainId = row.chainId;
    if (chainId && blockedChains.has(chainId)) continue;
    if (await hasSealedInboxMessage(myUserId, row.id)) {
      await deleteOwnBlob(row.id, myUserId).catch(() => undefined);
      continue;
    }

    const tryOpen = async (allowHeal: boolean) => {
      for (const peer of ordered) {
        const peerSpki = spkiByPeer.get(peer.userId);
        if (!peerSpki) continue;
        const opened = await openNvl3Blob({
          myUserId,
          peerUserId: peer.userId,
          peerIdentitySpki: peerSpki,
          ciphertext: row.ciphertext,
          allowHeal,
        });
        if (opened === 'already') return { peer, opened: 'already' as const };
        if (!opened) continue;
        return { peer, opened };
      }
      return null;
    };

    // Pass 1: no ratchet reset. Pass 2: heal once per contact if needed.
    let hit = await tryOpen(false);
    if (!hit) hit = await tryOpen(true);

    if (!hit) {
      // Keep the blob. Do not open a later message of this chain ahead of it.
      if (chainId) blockedChains.add(chainId);
      continue;
    }
    if (hit.opened === 'already') continue;

    const { peer, opened } = hit;
    try {
      const capability = tryParseNevTorCapability(opened.body);
      if (capability) {
        await setPeerNevTorStatus(myUserId, peer.userId, capability);
        await deleteOwnBlob(row.id, myUserId).catch(() => undefined);
        const { acknowledgeInAppUnreadIds } = await import('./inAppUnread');
        await acknowledgeInAppUnreadIds([row.id]).catch(() => undefined);
        continue;
      }
      const chatRequire = tryParseChatNevTorRequire(opened.body);
      if (chatRequire) {
        const requireKey = chatRequire.conversationId
          ?? defaultDmConversationId(myUserId, peer.userId);
        await setPeerChatNevTorRequire(myUserId, requireKey, chatRequire.required, chatRequire.updatedAt);
        await markThreadConfirmed(myUserId, requireKey, peer.userId).catch(() => undefined);
        await deleteOwnBlob(row.id, myUserId).catch(() => undefined);
        const { acknowledgeInAppUnreadIds } = await import('./inAppUnread');
        await acknowledgeInAppUnreadIds([row.id]).catch(() => undefined);
        continue;
      }
      if (isThreadControlPlaintext(opened.body)) {
        await applyThreadControl({
          myUserId,
          peerUserId: peer.userId,
          body: opened.body,
        });
        await deleteOwnBlob(row.id, myUserId).catch(() => undefined);
        const { acknowledgeInAppUnreadIds } = await import('./inAppUnread');
        await acknowledgeInAppUnreadIds([row.id]).catch(() => undefined);
        continue;
      }
      if (isAvatarPlaintext(opened.body)) {
        await applyIncomingAvatar(peer.userId, opened.body);
        await deleteOwnBlob(row.id, myUserId).catch(() => undefined);
        const { acknowledgeInAppUnreadIds } = await import('./inAppUnread');
        await acknowledgeInAppUnreadIds([row.id]).catch(() => undefined);
        continue;
      }
      await persistOpenedBlob({
        myUserId,
        peerUserId: peer.userId,
        blobId: row.id,
        body: opened.body,
        sentAt: opened.sentAt,
        expiresAt: row.expires_at,
      });
    } catch {
      // Keep the blob for a later retry if local persist failed after decrypt.
    }
  }
}

/** Server-side sealed blobs still waiting for this recipient (for unread reconcile). */
export async function listPendingInboxBlobIds(myUserId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('message_blobs')
    .select('id')
    .eq('recipient_id', myUserId)
    .like('ciphertext', `${NVL3_PREFIX}%`);
  if (error) {
    if (isMissingRelation(error)) return [];
    return [];
  }
  return (data ?? []).map(row => row.id as string).filter(Boolean);
}

/** Keep unread for server-pending blobs and locally opened (possibly Tor-locked) messages. */
export async function pruneInAppUnreadToPendingBlobs(myUserId: string) {
  const { data, error } = await supabase
    .from('message_blobs')
    .select('id')
    .eq('recipient_id', myUserId)
    .like('ciphertext', `${NVL3_PREFIX}%`);
  if (error) {
    if (isMissingRelation(error)) {
      const localIds = await listSealedInboxIds(myUserId).catch(() => [] as string[]);
      if (!localIds.length) {
        const { wipeInAppUnread } = await import('./inAppUnread');
        await wipeInAppUnread().catch(() => undefined);
      }
      return;
    }
    return;
  }
  const pending = new Set((data ?? []).map(row => row.id as string));
  for (const id of await listSealedInboxIds(myUserId).catch(() => [] as string[])) {
    pending.add(id);
  }
  const { pruneInAppUnread } = await import('./inAppUnread');
  await pruneInAppUnread(pending).catch(() => undefined);
}

/**
 * Instant chat paint from on-device sealed inbox + outbox (retention window).
 * Does not hit the network — use before consume/sync so Honor H8 opens feel instant.
 */
export async function loadConversationMessagesLocal(
  myUserId: string,
  peerUserId: string,
  conversationId?: string,
): Promise<DecryptedMessage[]> {
  const cid = conversationId ?? defaultDmConversationId(myUserId, peerUserId);
  const peerIds = [peerUserId];
  const decrypted: DecryptedMessage[] = [];
  for (const item of await listSealedInboxForConversation(myUserId, cid, peerIds)) {
    if (isNevTorCapabilityPlaintext(item.plaintext) || isThreadControlPlaintext(item.plaintext) || isAvatarPlaintext(item.plaintext)) continue;
    decrypted.push({
      id: item.id,
      senderId: peerUserId,
      plaintext: item.plaintext,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
    });
  }
  for (const item of await listOutboxForConversation(myUserId, cid, peerIds)) {
    if (isNevTorCapabilityPlaintext(item.plaintext) || isThreadControlPlaintext(item.plaintext) || isAvatarPlaintext(item.plaintext)) continue;
    decrypted.push({
      id: item.id,
      senderId: myUserId,
      plaintext: item.plaintext,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
    });
  }
  decrypted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return decrypted;
}

export async function loadConversationMessages(
  conversationId: string,
  myUserId?: string,
  peerUserId?: string,
  opts?: { skipConsume?: boolean; skipLegacyNetwork?: boolean; memberIds?: string[] },
): Promise<DecryptedMessage[]> {
  const decrypted: DecryptedMessage[] = [];
  const skipConsume = opts?.skipConsume === true;
  const skipLegacyNetwork = opts?.skipLegacyNetwork === true;
  const members = opts?.memberIds?.length
    ? opts.memberIds
    : peerUserId
      ? [peerUserId]
      : [];

  if (myUserId && members.length) {
    if (!skipConsume) {
      for (const peer of members) {
        await consumeSealedChatBlobs(myUserId, peer, { peerOnly: true });
      }
      await pruneInAppUnreadToPendingBlobs(myUserId).catch(() => undefined);
    }
    for (const item of await listSealedInboxForConversation(myUserId, conversationId, members)) {
      if (isNevTorCapabilityPlaintext(item.plaintext)) {
        const capability = tryParseNevTorCapability(item.plaintext);
        if (capability) await setPeerNevTorStatus(myUserId, item.peerUserId, capability);
        const chatRequire = tryParseChatNevTorRequire(item.plaintext);
        if (chatRequire) {
          const requireKey = chatRequire.conversationId ?? conversationId;
          await setPeerChatNevTorRequire(myUserId, requireKey, chatRequire.required, chatRequire.updatedAt);
        }
        continue;
      }
      if (isThreadControlPlaintext(item.plaintext)) {
        await applyThreadControl({
          myUserId,
          peerUserId: item.peerUserId,
          body: item.plaintext,
        });
        continue;
      }
      if (isAvatarPlaintext(item.plaintext)) {
        await applyIncomingAvatar(item.peerUserId, item.plaintext);
        continue;
      }
      decrypted.push({
        id: item.id,
        senderId: item.peerUserId,
        plaintext: item.plaintext,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
      });
    }
    for (const item of await listOutboxForConversation(myUserId, conversationId, members)) {
      if (isNevTorCapabilityPlaintext(item.plaintext) || isThreadControlPlaintext(item.plaintext) || isAvatarPlaintext(item.plaintext)) continue;
      decrypted.push({
        id: item.id,
        senderId: myUserId,
        plaintext: item.plaintext,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
      });
    }
  }

  const legacyPeer = peerUserId ?? members[0];
  const local = myUserId && legacyPeer
    ? (await loadLocalContacts(myUserId)).find(contact => contact.userId === legacyPeer)
    : undefined;
  const legacyId = local?.legacyConversationId;
  const isDefaultDm = Boolean(
    myUserId && legacyPeer && conversationId === defaultDmConversationId(myUserId, legacyPeer),
  );
  const inbox = myUserId && legacyId && isDefaultDm
    ? await listLegacyInboxForConversation(myUserId, legacyId)
    : [];
  const leftover: Array<{ id: string; sender_id: string; ciphertext: string; created_at: string; expires_at: string | null }> = inbox.map(row => ({
    id: row.id,
    sender_id: row.senderId,
    ciphertext: row.ciphertext,
    created_at: row.createdAt,
    expires_at: row.expiresAt,
  }));
  if (legacyId && isDefaultDm && !skipLegacyNetwork) {
    const { data, error } = await supabase
      .from('encrypted_messages')
      .select('id,sender_id,ciphertext,created_at,expires_at')
      .eq('conversation_id', legacyId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: true });
    if (error && !isMissingRelation(error)) throw error;
    for (const row of data ?? []) {
      if (!leftover.some(item => item.id === row.id)) leftover.push(row);
    }
  }

  if (leftover.length) {
    for (const row of leftover) {
      if (decrypted.some(item => item.id === row.id)) continue;
      try {
        decrypted.push({
          id: row.id,
          senderId: row.sender_id,
          plaintext: await decryptStoredMessage(row),
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        });
      } catch (error: any) {
        const raw = String(error?.message ?? 'decrypt failed').replace(/\s+/g, ' ');
        const reason = /openpgp|pgp/i.test(raw) ? 'This older message could not be decrypted.' : raw.slice(0, 80);
        decrypted.push({
          id: row.id,
          senderId: row.sender_id,
          plaintext: `[Unable to decrypt: ${reason}]`,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        });
      }
    }
  }

  decrypted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return decrypted;
}

export function subscribeToConversation(conversationId: string, onChange: (payload: any) => void, myUserId?: string) {
  const channel = supabase.channel(`conversation:${conversationId}:${myUserId ?? 'inbox'}`);
  if (myUserId) {
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_blobs', filter: `recipient_id=eq.${myUserId}` },
      onChange,
    );
  }
  return channel.subscribe();
}
