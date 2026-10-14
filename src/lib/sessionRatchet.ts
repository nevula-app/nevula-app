// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';
import { assertChatEnvelopeVersion, CRYPTO_CHAT_ENVELOPE_VERSION } from './cryptoPolicy';
import {
  ecdhKeyParams,
  ecdhSecret,
  ensureP256Keys,
  getIdentityPrivateKey,
  importSpki,
  NVL3_PREFIX,
} from './messageCrypto';
import { decapsulateKem, encapsulateToPeer, isKemCiphertext, MLKEM768_SS_BYTES } from './pqKem';

const INDEX_KEY = 'nevula.ratchet.index.v1';
const MAX_SKIP = 64;
const DH_ROTATE_EVERY = 20;
const MAX_CONSUMED = 256;
const ZERO = new Uint8Array(32);

export class PeerKeyChangedError extends Error {
  constructor() {
    super('Peer device key changed. Reset the secure session before continuing this chat.');
    this.name = 'PeerKeyChangedError';
  }
}

export class SessionRollbackError extends Error {
  constructor() {
    super('Chat key state looks rolled back. Reset the secure session on this device.');
    this.name = 'SessionRollbackError';
  }
}

type RatchetState = {
  v: 2;
  peerSpki: string;
  /** Peer's ML-KEM-768 public key, when this device encapsulated to them. */
  peerKemPk: string;
  /** KEM ciphertext mixed into the session root. Repeated on every envelope. */
  kemCt: string;
  rootKey: string;
  dhsPriv: JsonWebKey;
  dhsPub: string;
  dhr: string | null;
  ckS: string | null;
  ckR: string | null;
  ns: number;
  nr: number;
  pn: number;
  epoch: number;
  skipped: Record<string, string>;
  /** Recently consumed dh:n slots (replay defence after skip-key deletion). */
  consumed: string[];
};

type SessionCommit = {
  epoch: number;
  ns: number;
  nr: number;
  rootHash: string;
};

export type Nvl3Envelope = {
  v: typeof CRYPTO_CHAT_ENVELOPE_VERSION;
  dh: string;
  /** ML-KEM-768 ciphertext bound into the session key. */
  kem: string;
  n: number;
  pn: number;
  iv: string;
  ct: string;
};

export type OpenedMessage = {
  body: string;
  sentAt: string;
};

function sessionKey(myUserId: string, peerUserId: string) {
  return `nevula.ratchet.v1.${myUserId}.${peerUserId}`;
}

function commitKey(myUserId: string, peerUserId: string) {
  return `nevula.ratchet.commit.v1.${myUserId}.${peerUserId}`;
}

function skipKey(dh: string, n: number) {
  return `${dh}:${n}`;
}

function asSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], pair => Number.parseInt(pair, 16));
}

async function sha256Hex(bytes: Uint8Array) {
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', asSource(bytes))));
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, length: number) {
  const key = await globalThis.crypto.subtle.importKey('raw', asSource(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: asSource(salt), info: asSource(new TextEncoder().encode(info)) },
    key,
    length * 8,
  ));
}

async function kdfRk(rootKey: Uint8Array, dhOut: Uint8Array) {
  const okm = await hkdf(dhOut, rootKey, 'NVL3-RK', 64);
  return { rk: okm.subarray(0, 32), ck: okm.subarray(32, 64) };
}

async function kdfCk(chainKey: Uint8Array) {
  const okm = await hkdf(chainKey, ZERO, 'NVL3-CK', 64);
  return { ck: okm.subarray(0, 32), mk: okm.subarray(32, 64) };
}

/**
 * Hybrid session key: identity ECDH ‖ ephemeral ECDH ‖ ML-KEM shared secret.
 * Both secrets are required. A missing KEM secret is a hard failure.
 */
async function deriveSessionKey(dhIk: Uint8Array, dhEph: Uint8Array, kemSs: Uint8Array) {
  if (kemSs.length !== MLKEM768_SS_BYTES) throw new Error('This message is missing its post-quantum key exchange.');
  return hkdf(concat(dhIk, dhEph, kemSs), ZERO, 'NVL4-SK-hybrid', 32);
}

async function generateDh() {
  const pair = await globalThis.crypto.subtle.generateKey(ecdhKeyParams, true, ['deriveBits']);
  if (!('privateKey' in pair) || !('publicKey' in pair)) throw new Error('Could not rotate the chat key.');
  const dhsPriv = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  const dhsPub = fromByteArray(new Uint8Array(await globalThis.crypto.subtle.exportKey('spki', pair.publicKey)));
  return { priv: pair.privateKey, dhsPriv, dhsPub };
}

async function importDhPriv(jwk: JsonWebKey) {
  return globalThis.crypto.subtle.importKey('jwk', jwk, ecdhKeyParams, false, ['deriveBits']);
}

async function aesGcmEncrypt(mk: Uint8Array, plaintext: string) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await globalThis.crypto.subtle.importKey('raw', asSource(mk), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asSource(iv) },
    key,
    asSource(new TextEncoder().encode(plaintext)),
  ));
  return { iv: fromByteArray(iv), ct: fromByteArray(ct) };
}

async function aesGcmDecrypt(mk: Uint8Array, ivB64: string, ctB64: string) {
  const key = await globalThis.crypto.subtle.importKey('raw', asSource(mk), 'AES-GCM', false, ['decrypt']);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asSource(toByteArray(ivB64)) },
    key,
    asSource(toByteArray(ctB64)),
  );
  return new TextDecoder().decode(plain);
}

async function loadIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberSession(myUserId: string, peerUserId: string) {
  const id = `${myUserId}:${peerUserId}`;
  const index = await loadIndex();
  if (index.includes(id)) return;
  index.push(id);
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(index), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function loadCommit(myUserId: string, peerUserId: string): Promise<SessionCommit | null> {
  const raw = await SecureStore.getItemAsync(commitKey(myUserId, peerUserId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionCommit;
    if (typeof parsed?.epoch !== 'number' || typeof parsed?.ns !== 'number' || typeof parsed?.nr !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCommit(myUserId: string, peerUserId: string, state: RatchetState) {
  const commit: SessionCommit = {
    epoch: state.epoch,
    ns: state.ns,
    nr: state.nr,
    rootHash: await sha256Hex(hexToBytes(state.rootKey)),
  };
  await SecureStore.setItemAsync(commitKey(myUserId, peerUserId), JSON.stringify(commit), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

function assertNoRollback(state: RatchetState, commit: SessionCommit | null) {
  if (!commit) return;
  if (state.epoch < commit.epoch) throw new SessionRollbackError();
  if (state.epoch === commit.epoch && (state.ns < commit.ns || state.nr < commit.nr)) {
    throw new SessionRollbackError();
  }
}

async function loadState(myUserId: string, peerUserId: string, peerSpki: string, peerKemPk?: string): Promise<RatchetState | null> {
  const raw = await SecureStore.getItemAsync(sessionKey(myUserId, peerUserId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RatchetState;
    if (parsed?.v !== 2 || typeof parsed.peerSpki !== 'string') return null;
    const state = parsed;
    if (!Array.isArray(state.consumed)) state.consumed = [];
    if (typeof state.epoch !== 'number') state.epoch = 0;
    if (typeof state.peerKemPk !== 'string') state.peerKemPk = '';
    if (state.peerSpki !== peerSpki) throw new PeerKeyChangedError();
    if (peerKemPk && state.peerKemPk && state.peerKemPk !== peerKemPk) throw new PeerKeyChangedError();
    // Pre-hybrid sessions have no KEM ciphertext. Drop them and start a hybrid session.
    if (!state.kemCt || !isKemCiphertext(state.kemCt)) return null;
    assertNoRollback(state, await loadCommit(myUserId, peerUserId));
    return state;
  } catch (error) {
    if (error instanceof PeerKeyChangedError || error instanceof SessionRollbackError) throw error;
    return null;
  }
}

async function saveState(myUserId: string, peerUserId: string, state: RatchetState) {
  await rememberSession(myUserId, peerUserId);
  await SecureStore.setItemAsync(sessionKey(myUserId, peerUserId), JSON.stringify(state), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await saveCommit(myUserId, peerUserId, state);
}

function rememberConsumed(state: RatchetState, dh: string, n: number) {
  const id = skipKey(dh, n);
  if (state.consumed.includes(id)) throw new Error('Message was already opened on this device.');
  state.consumed.push(id);
  if (state.consumed.length > MAX_CONSUMED) {
    state.consumed = state.consumed.slice(state.consumed.length - MAX_CONSUMED);
  }
}

async function initInitiator(peerSpki: string, peerKemPk: string): Promise<RatchetState> {
  await ensureP256Keys();
  const kem = await encapsulateToPeer(peerKemPk);
  const dh = await generateDh();
  const myPriv = await getIdentityPrivateKey();
  const theirIk = await importSpki(peerSpki);
  const dhIk = await ecdhSecret(myPriv, theirIk);
  const dhEph = await ecdhSecret(dh.priv, theirIk);
  const sk = await deriveSessionKey(dhIk, dhEph, kem.sharedSecret);
  const next = await kdfRk(sk, dhEph);
  return {
    v: 2,
    peerSpki,
    peerKemPk,
    kemCt: kem.cipherTextB64,
    rootKey: bytesToHex(next.rk),
    dhsPriv: dh.dhsPriv,
    dhsPub: dh.dhsPub,
    dhr: null,
    ckS: bytesToHex(next.ck),
    ckR: null,
    ns: 0,
    nr: 0,
    pn: 0,
    epoch: 0,
    skipped: {},
    consumed: [],
  };
}

async function initResponder(peerSpki: string, theirDh: string, kemCt: string): Promise<RatchetState> {
  await ensureP256Keys();
  const kemSs = await decapsulateKem(kemCt);
  const myPriv = await getIdentityPrivateKey();
  const theirIk = await importSpki(peerSpki);
  const theirRatchet = await importSpki(theirDh);
  const dhIk = await ecdhSecret(myPriv, theirIk);
  const dhEph = await ecdhSecret(myPriv, theirRatchet);
  const sk = await deriveSessionKey(dhIk, dhEph, kemSs);
  const next = await kdfRk(sk, dhEph);
  const dh = await generateDh();
  return {
    v: 2,
    peerSpki,
    peerKemPk: '',
    kemCt,
    rootKey: bytesToHex(next.rk),
    dhsPriv: dh.dhsPriv,
    dhsPub: dh.dhsPub,
    dhr: theirDh,
    ckS: null,
    ckR: bytesToHex(next.ck),
    ns: 0,
    nr: 0,
    pn: 0,
    epoch: 1,
    skipped: {},
    consumed: [],
  };
}

async function dhRatchetOnReceive(state: RatchetState, theirDh: string) {
  state.pn = state.ns;
  state.ns = 0;
  state.nr = 0;
  state.dhr = theirDh;
  state.epoch += 1;
  const myPriv = await importDhPriv(state.dhsPriv);
  const theirPub = await importSpki(theirDh);
  const shared = await ecdhSecret(myPriv, theirPub);
  const recv = await kdfRk(hexToBytes(state.rootKey), shared);
  state.rootKey = bytesToHex(recv.rk);
  state.ckR = bytesToHex(recv.ck);
  // Keep the published send key until the next encrypt. A send-side DH
  // rotate against a stale peer key would not match the receiver.
  state.ckS = null;
}

async function dhRatchetOnSend(state: RatchetState) {
  if (!state.dhr) return;
  state.pn = state.ns;
  state.ns = 0;
  state.epoch += 1;
  const nextDh = await generateDh();
  const theirPub = await importSpki(state.dhr);
  const shared = await ecdhSecret(nextDh.priv, theirPub);
  const send = await kdfRk(hexToBytes(state.rootKey), shared);
  state.rootKey = bytesToHex(send.rk);
  state.ckS = bytesToHex(send.ck);
  state.dhsPriv = nextDh.dhsPriv;
  state.dhsPub = nextDh.dhsPub;
}

async function skipMessageKeys(state: RatchetState, until: number) {
  if (!state.ckR) throw new Error('Chat key is not ready.');
  if (until - state.nr > MAX_SKIP) throw new Error('Message is too far ahead of this chat key.');
  let ck = hexToBytes(state.ckR);
  while (state.nr < until) {
    const next = await kdfCk(ck);
    if (state.dhr) state.skipped[skipKey(state.dhr, state.nr)] = bytesToHex(next.mk);
    ck = next.ck;
    state.nr += 1;
  }
  state.ckR = bytesToHex(ck);
}

async function takeRecvKey(state: RatchetState, dh: string, n: number) {
  const cached = state.skipped[skipKey(dh, n)];
  if (cached) {
    delete state.skipped[skipKey(dh, n)];
    return hexToBytes(cached);
  }
  if (!state.ckR || state.dhr !== dh) throw new Error('Chat key does not match this message.');
  await skipMessageKeys(state, n);
  const next = await kdfCk(hexToBytes(state.ckR));
  state.ckR = bytesToHex(next.ck);
  state.nr = n + 1;
  return next.mk;
}

function packEnvelope(envelope: Nvl3Envelope) {
  return `${NVL3_PREFIX}${fromByteArray(new TextEncoder().encode(JSON.stringify(envelope)))}`;
}

export function isNvl3Ciphertext(value: unknown) {
  return typeof value === 'string' && value.startsWith(NVL3_PREFIX);
}

export function readNvl3Envelope(value: string): Nvl3Envelope {
  const parsed = JSON.parse(new TextDecoder().decode(toByteArray(value.slice(NVL3_PREFIX.length)))) as Nvl3Envelope;
  assertChatEnvelopeVersion(parsed?.v);
  if (!parsed.dh || typeof parsed.n !== 'number' || !isKemCiphertext(parsed.kem)) {
    throw new Error('This message is missing its post-quantum key exchange.');
  }
  return parsed;
}

export async function resetRatchetSession(myUserId: string, peerUserId: string) {
  await SecureStore.deleteItemAsync(sessionKey(myUserId, peerUserId)).catch(() => undefined);
  await SecureStore.deleteItemAsync(commitKey(myUserId, peerUserId)).catch(() => undefined);
}

export async function encryptNvl3(params: {
  myUserId: string;
  peerUserId: string;
  peerIdentitySpki: string;
  peerKemPk: string;
  plaintext: string;
  sentAt?: string;
}) {
  let state = await loadState(params.myUserId, params.peerUserId, params.peerIdentitySpki, params.peerKemPk);
  if (!state) state = await initInitiator(params.peerIdentitySpki, params.peerKemPk);
  if (!state.peerKemPk) state.peerKemPk = params.peerKemPk;
  if (state.dhr && state.ns >= DH_ROTATE_EVERY) await dhRatchetOnSend(state);
  if (!state.ckS) {
    await dhRatchetOnSend(state);
    if (!state.ckS) throw new Error('Chat key is not ready.');
  }
  const next = await kdfCk(hexToBytes(state.ckS));
  state.ckS = bytesToHex(next.ck);
  const n = state.ns;
  state.ns += 1;
  const inner = JSON.stringify({ ts: params.sentAt ?? new Date().toISOString(), body: params.plaintext });
  const sealed = await aesGcmEncrypt(next.mk, inner);
  if (!state.kemCt) throw new Error('This message is missing its post-quantum key exchange.');
  const envelope: Nvl3Envelope = {
    v: CRYPTO_CHAT_ENVELOPE_VERSION,
    dh: state.dhsPub,
    kem: state.kemCt,
    n,
    pn: state.pn,
    ...sealed,
  };
  await saveState(params.myUserId, params.peerUserId, state);
  return packEnvelope(envelope);
}

export async function decryptNvl3(params: {
  myUserId: string;
  peerUserId: string;
  peerIdentitySpki: string;
  ciphertext: string;
}): Promise<OpenedMessage> {
  const envelope = readNvl3Envelope(params.ciphertext);
  let state = await loadState(params.myUserId, params.peerUserId, params.peerIdentitySpki);
  if (!state) state = await initResponder(params.peerIdentitySpki, envelope.dh, envelope.kem);

  const slot = skipKey(envelope.dh, envelope.n);
  if (state.consumed.includes(slot)) {
    throw new Error('Message was already opened on this device.');
  }

  const skipped = state.skipped[slot];
  let mk: Uint8Array;
  if (skipped) {
    delete state.skipped[slot];
    mk = hexToBytes(skipped);
  } else {
    if (state.dhr !== envelope.dh) {
      if (state.ckR) await skipMessageKeys(state, envelope.pn);
      await dhRatchetOnReceive(state, envelope.dh);
    }
    mk = await takeRecvKey(state, envelope.dh, envelope.n);
  }

  const opened = JSON.parse(await aesGcmDecrypt(mk, envelope.iv, envelope.ct)) as { ts?: string; body?: string };
  rememberConsumed(state, envelope.dh, envelope.n);
  await saveState(params.myUserId, params.peerUserId, state);
  if (typeof opened.body !== 'string') throw new Error('Unknown message format.');
  return { body: opened.body, sentAt: typeof opened.ts === 'string' ? opened.ts : new Date().toISOString() };
}

export async function wipeRatchetSessions() {
  const index = await loadIndex();
  for (const id of index) {
    const split = id.split(':');
    const myUserId = split[0];
    const peerUserId = split.slice(1).join(':');
    if (!myUserId || !peerUserId) continue;
    await resetRatchetSession(myUserId, peerUserId);
  }
  await SecureStore.deleteItemAsync(INDEX_KEY).catch(() => undefined);
}
