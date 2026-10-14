// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';

/** FIPS 203 ML-KEM-768 sizes. */
export const MLKEM768_PK_BYTES = 1184;
export const MLKEM768_SK_BYTES = 2400;
export const MLKEM768_CT_BYTES = 1088;
export const MLKEM768_SS_BYTES = 32;

const PK_KEY = 'nevula.kem768.pk.v1';
const SK_KEY_A = 'nevula.kem768.sk.a.v1';
const SK_KEY_B = 'nevula.kem768.sk.b.v1';
/** Stay under Expo SecureStore's documented 2048-byte value limit. */
const SK_CHUNK = 1800;
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const REPAIR_KEM_ERROR = 'This contact has no post-quantum key. Scan their current pairing code.';

function toB64Url(bytes: Uint8Array) {
  return fromByteArray(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64Url(value: string) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return toByteArray(b64 + pad);
}

export function kemPublicKeyBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return 0;
  try {
    return fromB64Url(value).length;
  } catch {
    return 0;
  }
}

export function isKemPublicKey(value: string) {
  return kemPublicKeyBytes(value) === MLKEM768_PK_BYTES;
}

export function isKemCiphertext(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return fromB64Url(value).length === MLKEM768_CT_BYTES;
  } catch {
    return false;
  }
}

async function readSecretKey() {
  const [a, b] = await Promise.all([
    SecureStore.getItemAsync(SK_KEY_A),
    SecureStore.getItemAsync(SK_KEY_B),
  ]);
  if (!a || !b) return null;
  try {
    const secret = fromB64Url(a + b);
    return secret.length === MLKEM768_SK_BYTES ? secret : null;
  } catch {
    return null;
  }
}

export async function ensureKemKeys(): Promise<{ publicKeyB64: string }> {
  const existingPk = await SecureStore.getItemAsync(PK_KEY);
  const existingSk = await readSecretKey();
  if (existingPk && existingSk && isKemPublicKey(existingPk)) return { publicKeyB64: existingPk };

  const { publicKey, secretKey } = ml_kem768.keygen();
  if (publicKey.length !== MLKEM768_PK_BYTES || secretKey.length !== MLKEM768_SK_BYTES) {
    throw new Error('Could not create the post-quantum device key.');
  }
  const publicKeyB64 = toB64Url(publicKey);
  const secretKeyB64 = toB64Url(secretKey);
  await SecureStore.setItemAsync(SK_KEY_A, secretKeyB64.slice(0, SK_CHUNK), storeOptions);
  await SecureStore.setItemAsync(SK_KEY_B, secretKeyB64.slice(SK_CHUNK), storeOptions);
  await SecureStore.setItemAsync(PK_KEY, publicKeyB64, storeOptions);
  return { publicKeyB64 };
}

export async function encapsulateToPeer(peerPublicKeyB64: string) {
  if (!isKemPublicKey(peerPublicKeyB64)) throw new Error(REPAIR_KEM_ERROR);
  try {
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(fromB64Url(peerPublicKeyB64));
    if (cipherText.length !== MLKEM768_CT_BYTES || sharedSecret.length !== MLKEM768_SS_BYTES) {
      throw new Error('short');
    }
    return { cipherTextB64: toB64Url(cipherText), sharedSecret };
  } catch (error) {
    if (error instanceof Error && error.message === REPAIR_KEM_ERROR) throw error;
    throw new Error('This contact’s post-quantum key is not usable. Scan their current pairing code.');
  }
}

export async function decapsulateKem(cipherTextB64: string) {
  if (!isKemCiphertext(cipherTextB64)) {
    throw new Error('This message is missing its post-quantum key exchange.');
  }
  const secretKey = await readSecretKey();
  if (!secretKey) throw new Error('This device has no post-quantum key. Open NEVULA again and show a new pairing code.');
  const shared = ml_kem768.decapsulate(fromB64Url(cipherTextB64), secretKey);
  if (shared.length !== MLKEM768_SS_BYTES) throw new Error('This message is missing its post-quantum key exchange.');
  return shared;
}

export async function wipeKemKeys() {
  await SecureStore.deleteItemAsync(PK_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(SK_KEY_A).catch(() => undefined);
  await SecureStore.deleteItemAsync(SK_KEY_B).catch(() => undefined);
}
