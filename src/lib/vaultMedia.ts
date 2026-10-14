// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { sendEncryptedMessage } from './messaging';
import { revealVaultItem, type VaultItem, type VaultKind } from './media';

const PREFIX = 'NVLMEDIA.1.';
const PLAY_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}nevula-chat-media/`;
export const MAX_VAULT_SEND_BYTES = 3_500_000;

export type VaultMediaPayload = {
  v: 1;
  kind: 'media';
  mediaKind: VaultKind;
  fileName: string;
  mime: string;
  bytes: string;
};

function mimeFor(item: VaultItem) {
  if (item.kind === 'photo') return 'image/jpeg';
  if (item.kind === 'video') return 'video/mp4';
  const ext = (item.originalName ?? item.fileName).split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export function parseVaultMediaPayload(plaintext: string): VaultMediaPayload | null {
  if (!plaintext.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(plaintext.slice(PREFIX.length)) as Partial<VaultMediaPayload>;
    if (parsed.kind !== 'media' || parsed.v !== 1) return null;
    if (parsed.mediaKind !== 'photo' && parsed.mediaKind !== 'video' && parsed.mediaKind !== 'file') return null;
    if (typeof parsed.bytes !== 'string' || parsed.bytes.length < 8) return null;
    if (typeof parsed.fileName !== 'string' || typeof parsed.mime !== 'string') return null;
    return {
      v: 1,
      kind: 'media',
      mediaKind: parsed.mediaKind,
      fileName: parsed.fileName.slice(0, 80),
      mime: parsed.mime.slice(0, 80),
      bytes: parsed.bytes,
    };
  } catch {
    return null;
  }
}

export function encodeVaultMediaPayload(payload: Omit<VaultMediaPayload, 'v' | 'kind'>): string {
  return `${PREFIX}${JSON.stringify({ v: 1, kind: 'media', ...payload })}`;
}

export async function sendVaultItem(params: {
  conversationId: string;
  senderId: string;
  recipientUserId: string;
  expiresAt: string;
  item: VaultItem;
}) {
  const revealed = await revealVaultItem(params.item);
  const info = await FileSystem.getInfoAsync(revealed);
  if (!info.exists || !info.size) throw new Error('That Gallery file is missing.');
  if (info.size > MAX_VAULT_SEND_BYTES) {
    throw new Error('This Gallery file is too large to send. Keep it under about 3 MB.');
  }
  const bytes = await FileSystem.readAsStringAsync(revealed, { encoding: 'base64' });
  const plaintext = encodeVaultMediaPayload({
    mediaKind: params.item.kind,
    fileName: params.item.originalName ?? params.item.fileName.replace(/\.enc$/, ''),
    mime: mimeFor(params.item),
    bytes,
  });
  await sendEncryptedMessage({
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientUserId: params.recipientUserId,
    plaintext,
    expiresAt: params.expiresAt,
  });
}

async function ensurePlayDir() {
  const dir = await FileSystem.getInfoAsync(PLAY_DIR);
  if (!dir.exists) await FileSystem.makeDirectoryAsync(PLAY_DIR, { intermediates: true });
}

export async function materializeVaultMedia(id: string, payload: VaultMediaPayload) {
  await ensurePlayDir();
  const safe = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'file';
  const dest = `${PLAY_DIR}${id}-${safe}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) await FileSystem.writeAsStringAsync(dest, payload.bytes, { encoding: 'base64' });
  return dest;
}
