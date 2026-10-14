// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';

const KEY = 'nevula.vault.aes.v1';
const MAGIC = new Uint8Array([0x4e, 0x56, 0x4c, 0x31]);

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function asSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function aesKey() {
  let hex = await SecureStore.getItemAsync(KEY);
  if (!hex) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY, hex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  const raw = Uint8Array.from(hex.match(/.{2}/g) ?? [], pair => Number.parseInt(pair, 16));
  return globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function isVaultBlob(bytes: Uint8Array) {
  return bytes.length >= 16 && MAGIC.every((value, index) => bytes[index] === value);
}

export async function encryptBytes(plain: Uint8Array) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey();
  const cipher = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: asSource(iv) }, key, asSource(plain)));
  return concat(MAGIC, iv, cipher);
}

export async function decryptBytes(packed: Uint8Array) {
  if (!isVaultBlob(packed)) throw new Error('Not a NEVULA Gallery file.');
  const iv = packed.slice(4, 16);
  const cipher = packed.slice(16);
  const key = await aesKey();
  return new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: asSource(iv) }, key, asSource(cipher)));
}

export async function encryptUtf8(text: string) {
  return fromByteArray(await encryptBytes(new TextEncoder().encode(text)));
}

export async function decryptUtf8(payload: string) {
  return new TextDecoder().decode(await decryptBytes(toByteArray(payload)));
}

export async function encryptFile(fromUri: string, toUri: string) {
  const plain = toByteArray(await FileSystem.readAsStringAsync(fromUri, { encoding: 'base64' }));
  await FileSystem.writeAsStringAsync(toUri, fromByteArray(await encryptBytes(plain)), { encoding: 'base64' });
}

export async function decryptFile(fromUri: string, toUri: string) {
  const packed = toByteArray(await FileSystem.readAsStringAsync(fromUri, { encoding: 'base64' }));
  const plain = isVaultBlob(packed) ? await decryptBytes(packed) : packed;
  await FileSystem.writeAsStringAsync(toUri, fromByteArray(plain), { encoding: 'base64' });
}

export async function wipeVaultKey() {
  await SecureStore.deleteItemAsync(KEY);
}
