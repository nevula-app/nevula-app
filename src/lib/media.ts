// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { decryptFile, decryptUtf8, encryptFile, encryptUtf8, isVaultBlob } from './localCrypto';
import { toByteArray } from 'react-native-quick-base64';
import { stripMediaFile } from './stripMediaMeta';

const VAULT_DIR = `${FileSystem.documentDirectory}nevula-vault/`;
const REVEAL_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}nevula-open/`;
const INDEX_FILE = `${VAULT_DIR}index.json`;
const NOMEDIA = `${VAULT_DIR}.nomedia`;

export type VaultKind = 'photo' | 'video' | 'file';

export type VaultItem = {
  id: string;
  kind: VaultKind;
  createdAt: string;
  fileName: string;
  durationMs?: number;
  originalName?: string;
};

async function ensureDir(path: string) {
  const dir = await FileSystem.getInfoAsync(path);
  if (!dir.exists) await FileSystem.makeDirectoryAsync(path, { intermediates: true });
}

async function ensureVault() {
  await ensureDir(VAULT_DIR);
  const nomedia = await FileSystem.getInfoAsync(NOMEDIA);
  if (!nomedia.exists) await FileSystem.writeAsStringAsync(NOMEDIA, '');
}

async function parseIndex(raw: string): Promise<{ items: VaultItem[]; plaintext: boolean }> {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { items: parsed, plaintext: true };
  } catch {
    try {
      const parsed = JSON.parse(await decryptUtf8(raw));
      return { items: Array.isArray(parsed) ? parsed : [], plaintext: false };
    } catch {
      return { items: [], plaintext: false };
    }
  }
  return { items: [], plaintext: false };
}

async function readIndex(): Promise<VaultItem[]> {
  await ensureVault();
  const info = await FileSystem.getInfoAsync(INDEX_FILE);
  if (!info.exists) return [];
  try {
    const parsed = await parseIndex(await FileSystem.readAsStringAsync(INDEX_FILE));
    if (parsed.plaintext && parsed.items.length) await writeIndex(parsed.items);
    return parsed.items;
  } catch {
    return [];
  }
}

async function writeIndex(items: VaultItem[]) {
  await ensureVault();
  await FileSystem.writeAsStringAsync(INDEX_FILE, await encryptUtf8(JSON.stringify(items)));
}

async function sealExistingFile(uri: string) {
  const packed = toByteArray(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }));
  if (!isVaultBlob(packed)) await encryptFile(uri, uri);
}

function extensionOf(uri: string, fallback: string) {
  const clean = uri.split('?')[0] ?? uri;
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || fallback).toLowerCase();
}

export function vaultUri(item: VaultItem) {
  return `${VAULT_DIR}${item.fileName}`;
}

export function vaultItemExtension(item: VaultItem) {
  const fromName = extensionOf(item.originalName ?? '', '');
  if (fromName) return fromName;
  const stored = item.fileName.replace(/\.enc$/, '');
  return extensionOf(stored, item.kind === 'video' ? 'mp4' : item.kind === 'photo' ? 'jpg' : 'bin');
}

export async function listVaultItems() {
  const items = await readIndex();
  const existing: VaultItem[] = [];
  for (const item of items) {
    const uri = vaultUri(item);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) continue;
    await sealExistingFile(uri);
    existing.push(item);
  }
  if (existing.length !== items.length) await writeIndex(existing);
  return existing;
}

export async function ingestCapture(cacheUri: string, kind: VaultKind, durationMs?: number, originalName?: string) {
  await ensureVault();
  const id = globalThis.crypto.randomUUID();
  const extension = extensionOf(cacheUri, kind === 'photo' ? 'jpg' : kind === 'video' ? 'mp4' : 'bin');
  const fileName = `${id}.${extension}.enc`;
  const dest = `${VAULT_DIR}${fileName}`;
  const stripKind = kind === 'video' ? 'video' : 'photo';
  const cleanUri = kind === 'file' && !/^(jpe?g|png|webp|mp4)$/i.test(extension)
    ? cacheUri
    : await stripMediaFile(cacheUri, stripKind, extension);
  try {
    await encryptFile(cleanUri, dest);
  } finally {
    if (cleanUri !== cacheUri) await FileSystem.deleteAsync(cleanUri, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => undefined);
  }
  const item: VaultItem = {
    id,
    kind,
    createdAt: new Date().toISOString(),
    fileName,
    durationMs,
    originalName,
  };
  const next = [item, ...(await readIndex())];
  await writeIndex(next);
  return item;
}

export async function importPhoneMedia(uri: string, suggestedName?: string) {
  const clean = uri.split('?')[0] ?? uri;
  const ext = extensionOf(clean, 'bin');
  const kind: VaultKind = /^(jpe?g|png|webp)$/i.test(ext)
    ? 'photo'
    : /^(mp4|mov)$/i.test(ext)
      ? 'video'
      : 'file';
  return ingestCapture(uri, kind, undefined, suggestedName);
}

export async function revealVaultItem(item: VaultItem) {
  await ensureDir(REVEAL_DIR);
  const dest = `${REVEAL_DIR}${item.id}.${vaultItemExtension(item)}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;
  await decryptFile(vaultUri(item), dest);
  return dest;
}

export async function clearRevealedVaultCache() {
  await FileSystem.deleteAsync(REVEAL_DIR, { idempotent: true });
}

export async function deleteVaultItem(id: string) {
  const items = await readIndex();
  const item = items.find(entry => entry.id === id);
  if (item) {
    await FileSystem.deleteAsync(vaultUri(item), { idempotent: true });
    await FileSystem.deleteAsync(`${REVEAL_DIR}${item.id}.${vaultItemExtension(item)}`, { idempotent: true }).catch(() => undefined);
  }
  await writeIndex(items.filter(entry => entry.id !== id));
}

export async function wipeMediaVault() {
  await FileSystem.deleteAsync(VAULT_DIR, { idempotent: true });
  await FileSystem.deleteAsync(REVEAL_DIR, { idempotent: true });
}
