// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';
import { wipeKemKeys } from './pqKem';

const P256_PRIV_KEY = 'nevula.p256.priv.jwk.v1';
const P256_PUB_KEY = 'nevula.p256.pub.spki.v1';
const SELF_WRAP_KEY = 'nevula.msg.selfwrap.v1';
const V2_PREFIX = 'NVL2.';

type Jwk = JsonWebKey;
type V2Part = { t: 'self' | 'ecdh'; spki?: string; iv: string; ct: string };
type V2Message = { v: 2; parts: V2Part[] };

const ecdhParams: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], pair => Number.parseInt(pair, 16));
}

function asSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function aesGcmKeyFromRaw(raw: Uint8Array) {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', asSource(raw)));
  return globalThis.crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(rawSecret: Uint8Array, plaintext: string) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await aesGcmKeyFromRaw(rawSecret);
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: asSource(iv) }, key, asSource(new TextEncoder().encode(plaintext))),
  );
  return { iv: fromByteArray(iv), ct: fromByteArray(cipher) };
}

async function aesDecrypt(rawSecret: Uint8Array, part: V2Part) {
  const iv = asSource(toByteArray(part.iv));
  const cipher = asSource(toByteArray(part.ct));
  const key = await aesGcmKeyFromRaw(rawSecret);
  const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function getSelfWrapSecret() {
  const existing = await SecureStore.getItemAsync(SELF_WRAP_KEY);
  if (existing) return hexToBytes(existing);
  const created = globalThis.crypto.getRandomValues(new Uint8Array(32));
  await SecureStore.setItemAsync(SELF_WRAP_KEY, bytesToHex(created), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

export async function ensureP256Keys(): Promise<{ spkiB64: string }> {
  const existingPriv = await SecureStore.getItemAsync(P256_PRIV_KEY);
  const existingPub = await SecureStore.getItemAsync(P256_PUB_KEY);
  if (existingPriv && existingPub) return { spkiB64: existingPub };

  const pair = await globalThis.crypto.subtle.generateKey(ecdhParams, true, ['deriveBits']);
  if (!('privateKey' in pair) || !('publicKey' in pair)) throw new Error('Could not create device key.');
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  const spki = new Uint8Array(await globalThis.crypto.subtle.exportKey('spki', pair.publicKey));
  const spkiB64 = fromByteArray(spki);
  await SecureStore.setItemAsync(P256_PRIV_KEY, JSON.stringify(jwk), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(P256_PUB_KEY, spkiB64, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return { spkiB64 };
}

export async function getIdentityPrivateKey() {
  const raw = await SecureStore.getItemAsync(P256_PRIV_KEY);
  if (!raw) throw new Error('Device key is not ready.');
  const jwk = JSON.parse(raw) as Jwk;
  return globalThis.crypto.subtle.importKey('jwk', jwk, ecdhParams, false, ['deriveBits']);
}

export async function importSpki(spkiB64: string) {
  return globalThis.crypto.subtle.importKey('spki', asSource(toByteArray(spkiB64)), ecdhParams, false, []);
}

export async function ecdhSecret(privateKey: CryptoKey, publicKey: CryptoKey) {
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256));
}

export const NVL3_PREFIX = 'NVL3.';
export const ecdhKeyParams = ecdhParams;

async function loadMyPrivateKey() {
  return getIdentityPrivateKey();
}

export function parsePublishedDeviceKey(armored: string | null | undefined) {
  const text = armored?.replace(/\r\n/g, '\n').trim() ?? '';
  const match = text.match(/^NEVULA-P256:([A-Za-z0-9+/=]+)\n([\s\S]*)$/);
  if (match) return { p256Spki: match[1], pgp: match[2] };
  return { p256Spki: null as string | null, pgp: text };
}

export function publishDevicePublicKey(p256Spki: string, pgpArmored: string) {
  return `NEVULA-P256:${p256Spki}\n${pgpArmored}`;
}

export function isV2Ciphertext(value: unknown) {
  if (typeof value === 'string') return value.startsWith(V2_PREFIX) || value.startsWith('{');
  return Boolean(value && typeof value === 'object');
}

export function readV2SenderSpki(value: unknown): string | null {
  try {
    const part = readV2(value).parts.find(item => item.t === 'ecdh' && item.spki);
    return part?.spki ?? null;
  } catch {
    return null;
  }
}

function readV2(value: unknown): V2Message {
  if (typeof value === 'string') {
    const raw = value.startsWith(V2_PREFIX) ? new TextDecoder().decode(toByteArray(value.slice(V2_PREFIX.length))) : value;
    return JSON.parse(raw) as V2Message;
  }
  return value as V2Message;
}

export async function encryptMessageV2(plaintext: string, recipientSpkis: string[]) {
  const { spkiB64: mySpki } = await ensureP256Keys();
  const myPrivate = await loadMyPrivateKey();
  const parts: V2Part[] = [{ t: 'self', ...(await aesEncrypt(await getSelfWrapSecret(), plaintext)) }];

  const unique = [...new Set(recipientSpkis.filter(Boolean))];
  if (!unique.length) throw new Error('The other device has not published an encryption key yet. Open Messages there once, then send again.');

  for (const spki of unique) {
    const theirPublic = await importSpki(spki);
    const secret = await ecdhSecret(myPrivate, theirPublic);
    parts.push({ t: 'ecdh', spki: mySpki, ...(await aesEncrypt(secret, plaintext)) });
  }

  const packed = JSON.stringify({ v: 2, parts } satisfies V2Message);
  return `${V2_PREFIX}${fromByteArray(new TextEncoder().encode(packed))}`;
}

export async function decryptMessageV2(value: unknown) {
  const payload = readV2(value);
  if (payload?.v !== 2 || !Array.isArray(payload.parts)) throw new Error('Unknown message format.');

  const errors: string[] = [];
  const selfPart = payload.parts.find(part => part.t === 'self');
  if (selfPart) {
    try {
      return await aesDecrypt(await getSelfWrapSecret(), selfPart);
    } catch (error: any) {
      errors.push(error?.message ?? 'self');
    }
  }

  let myPrivate: CryptoKey;
  try {
    myPrivate = await loadMyPrivateKey();
  } catch (error: any) {
    throw new Error(error?.message ?? 'Device key is not ready.');
  }

  for (const part of payload.parts) {
    if (part.t !== 'ecdh' || !part.spki) continue;
    try {
      const senderPublic = await importSpki(part.spki);
      const secret = await ecdhSecret(myPrivate, senderPublic);
      return await aesDecrypt(secret, part);
    } catch (error: any) {
      errors.push(error?.message ?? 'ecdh');
    }
  }
  throw new Error(errors[0] ?? 'No matching decryption key.');
}

export async function wipeMessageCrypto() {
  await SecureStore.deleteItemAsync(P256_PRIV_KEY);
  await SecureStore.deleteItemAsync(P256_PUB_KEY);
  await SecureStore.deleteItemAsync(SELF_WRAP_KEY);
  await wipeKemKeys();
}
