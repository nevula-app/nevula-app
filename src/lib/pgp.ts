// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as openpgp from 'openpgp';

const PASSPHRASE_KEY = 'nevula.pgp.passphrase.v1';
const PRIVATE_KEY_FILE = `${FileSystem.documentDirectory}nevula-private-key.asc`;

openpgp.config.allowInsecureDecryptionWithSigningKeys = true;
openpgp.config.allowMissingKeyFlags = true;
openpgp.config.useEllipticFallback = true;

const PGP_CONFIG: Partial<openpgp.Config> = {
  allowInsecureDecryptionWithSigningKeys: true,
  allowMissingKeyFlags: true,
  useEllipticFallback: true,
};

export type PgpIdentity = {
  publicKeyArmored: string;
  fingerprint: string;
};

function randomSecret(bytes = 32): string {
  const data = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(data);
  return Array.from(data, value => value.toString(16).padStart(2, '0')).join('');
}

function normalizeArmor(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim();
}

async function getOrCreatePassphrase(): Promise<string> {
  const existing = await SecureStore.getItemAsync(PASSPHRASE_KEY);
  if (existing) return existing;
  const created = randomSecret();
  await SecureStore.setItemAsync(PASSPHRASE_KEY, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

async function loadPrivateKeyArmored(): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(PRIVATE_KEY_FILE);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(PRIVATE_KEY_FILE);
}

export async function ensurePgpIdentity(label: string): Promise<PgpIdentity> {
  const passphrase = await getOrCreatePassphrase();
  let privateKeyArmored = await loadPrivateKeyArmored();
  let publicKeyArmored: string;

  if (!privateKeyArmored) {
    const generated = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [{ name: label }],
      passphrase,
      format: 'armored',
      config: PGP_CONFIG,
    });
    privateKeyArmored = generated.privateKey;
    publicKeyArmored = generated.publicKey;
    await FileSystem.writeAsStringAsync(PRIVATE_KEY_FILE, privateKeyArmored);
  } else {
    const encryptedPrivateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
    const privateKey = await openpgp.decryptKey({ privateKey: encryptedPrivateKey, passphrase, config: PGP_CONFIG });
    publicKeyArmored = privateKey.toPublic().armor();
  }

  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  return { publicKeyArmored, fingerprint: publicKey.getFingerprint().toUpperCase() };
}

async function getUnlockedPrivateKey() {
  const [passphrase, armoredKey] = await Promise.all([
    SecureStore.getItemAsync(PASSPHRASE_KEY),
    loadPrivateKeyArmored(),
  ]);
  if (!passphrase || !armoredKey) throw new Error('Secure identity is not initialized on this device.');
  const encryptedPrivateKey = await openpgp.readPrivateKey({ armoredKey });
  return openpgp.decryptKey({ privateKey: encryptedPrivateKey, passphrase, config: PGP_CONFIG });
}

export async function getLocalPublicArmored(): Promise<string> {
  const privateKey = await getUnlockedPrivateKey();
  return privateKey.toPublic().armor();
}

/**
 * OpenPGP encrypt is intentionally disabled for new chat traffic.
 * Signed OpenPGP messages break deniability and provide neither PFS nor PCS.
 * Historical ciphertext remains readable via decryptFromSender only.
 */
export async function encryptForRecipients(_plaintext: string, _recipientPublicKeysArmored: string[]): Promise<string> {
  throw new Error('OpenPGP chat encryption is disabled. New messages use the NVL3 ratchet only.');
}

export async function decryptFromSender(ciphertext: string, senderPublicKeysArmored: string[]): Promise<string> {
  const armored = normalizeArmor(ciphertext);
  if (!armored.includes('BEGIN PGP MESSAGE')) throw new Error('This older message is not in a known format.');
  const uniqueSenders = [...new Set(senderPublicKeysArmored.filter(Boolean))];
  if (!uniqueSenders.length) throw new Error('This older message could not be verified.');
  const decryptionKey = await getUnlockedPrivateKey();
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const verificationKeys = await Promise.all(uniqueSenders.map(armoredKey => openpgp.readKey({ armoredKey })));

  const decrypted = await openpgp.decrypt({
    message,
    decryptionKeys: decryptionKey,
    verificationKeys,
    format: 'utf8',
    config: PGP_CONFIG,
  });
  const verified = await Promise.all((decrypted.signatures ?? []).map(signature => signature.verified.catch(() => false)));
  if (!verified.some(Boolean)) throw new Error('This older message could not be verified.');
  if (typeof decrypted.data === 'string') return decrypted.data;
  return new TextDecoder().decode(decrypted.data as Uint8Array);
}

export async function wipePgpIdentity() {
  await FileSystem.deleteAsync(PRIVATE_KEY_FILE, { idempotent: true });
  await SecureStore.deleteItemAsync(PASSPHRASE_KEY);
}
