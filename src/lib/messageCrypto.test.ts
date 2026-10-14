// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secureStore.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secureStore.delete(key); }),
}));

vi.mock('react-native-quick-base64', () => ({
  fromByteArray: (value: Uint8Array) => Buffer.from(value).toString('base64'),
  toByteArray: (value: string) => new Uint8Array(Buffer.from(value, 'base64')),
}));

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { decryptMessageV2, encryptMessageV2, ensureP256Keys, readV2SenderSpki } from './messageCrypto';

describe('NVL2 message crypto', () => {
  beforeEach(() => secureStore.clear());

  it('roundtrips through the active NVL2 envelope', async () => {
    const { spkiB64 } = await ensureP256Keys();
    const ciphertext = await encryptMessageV2('private hello', [spkiB64]);
    await expect(decryptMessageV2(ciphertext)).resolves.toBe('private hello');
  });

  it('fails when neither the self-wrap key nor ECDH key matches', async () => {
    const { spkiB64 } = await ensureP256Keys();
    const ciphertext = await encryptMessageV2('private hello', [spkiB64]);
    secureStore.clear();
    await ensureP256Keys();
    await expect(decryptMessageV2(ciphertext)).rejects.toThrow();
  });

  it('exposes the sender device key used for the ECDH wrap', async () => {
    const { spkiB64 } = await ensureP256Keys();
    const ciphertext = await encryptMessageV2('pairing', [spkiB64]);
    expect(readV2SenderSpki(ciphertext)).toBe(spkiB64);
  });

  it('keeps the NVL2 prefix and payload version 2 stable', async () => {
    const { spkiB64 } = await ensureP256Keys();
    const ciphertext = await encryptMessageV2('versioned', [spkiB64]);
    expect(ciphertext.startsWith('NVL2.')).toBe(true);
    const payload = JSON.parse(Buffer.from(ciphertext.slice('NVL2.'.length), 'base64').toString('utf8'));
    expect(payload.v).toBe(2);
  });
});
