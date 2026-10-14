// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import {
  cancelVoiceRecording,
  isVoiceCaptureAvailable,
  playVoiceFile,
  prepareVoiceEngine,
  startVoiceRecording,
  stopAndDisguiseVoice,
  stopVoicePlayback,
  wipeVoiceTemps,
  type DisguiseResult,
  type VoiceMode,
} from 'nevula-voice';
import { sendEncryptedMessage } from './messaging';

export type { VoiceMode };

export const MAX_VOICE_MS = 60_000;
export const VOICE_MODES: { id: VoiceMode; label: string }[] = [
  { id: 'robot', label: 'Robot' },
  { id: 'chatter', label: 'Chatter' },
  { id: 'synthetic', label: 'Synthetic' },
];
const VOICE_PREFIX = 'NVLVOICE.1.';
const PLAY_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}nevula-voice-play/`;

export type VoicePayload = {
  v: 1;
  kind: 'voice';
  mode: VoiceMode;
  durationMs: number;
  mime: 'audio/mp4' | 'audio/wav';
  audio: string;
};

function isVoiceMode(value: unknown): value is VoiceMode {
  return value === 'robot' || value === 'chatter' || value === 'synthetic';
}

export function parseVoicePayload(plaintext: string): VoicePayload | null {
  if (!plaintext.startsWith(VOICE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(plaintext.slice(VOICE_PREFIX.length)) as Partial<VoicePayload>;
    if (parsed.kind !== 'voice' || parsed.v !== 1 || !isVoiceMode(parsed.mode)) return null;
    if (typeof parsed.audio !== 'string' || parsed.audio.length < 16) return null;
    const mime = parsed.mime === 'audio/wav' ? 'audio/wav' : 'audio/mp4';
    const durationMs = Math.max(1, Math.min(MAX_VOICE_MS, Math.floor(Number(parsed.durationMs) || 1)));
    return { v: 1, kind: 'voice', mode: parsed.mode, durationMs, mime, audio: parsed.audio };
  } catch {
    return null;
  }
}

export function encodeVoicePayload(payload: Omit<VoicePayload, 'v' | 'kind'>): string {
  return `${VOICE_PREFIX}${JSON.stringify({ v: 1, kind: 'voice', ...payload })}`;
}

export function formatVoiceClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export { isVoiceCaptureAvailable, startVoiceRecording, stopAndDisguiseVoice, cancelVoiceRecording, stopVoicePlayback, prepareVoiceEngine };

export async function sendDisguisedVoice(params: {
  conversationId: string;
  senderId: string;
  recipientUserId: string;
  expiresAt: string;
  result: DisguiseResult;
  mode?: VoiceMode;
}) {
  const info = await FileSystem.getInfoAsync(params.result.uri);
  if (!info.exists) throw new Error('Re-spoken audio was already removed.');
  const audio = await FileSystem.readAsStringAsync(params.result.uri, { encoding: 'base64' });
  await FileSystem.deleteAsync(params.result.uri, { idempotent: true }).catch(() => undefined);
  const mime = params.result.mime === 'audio/wav' ? 'audio/wav' : 'audio/mp4';
  const plaintext = encodeVoicePayload({
    mode: params.mode ?? 'robot',
    durationMs: Math.min(MAX_VOICE_MS, Math.max(1, Math.floor(params.result.durationMs))),
    mime,
    audio,
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

export async function playVoicePayload(id: string, payload: VoicePayload) {
  await stopVoicePlayback().catch(() => undefined);
  await ensurePlayDir();
  const ext = payload.mime === 'audio/wav' ? 'wav' : 'm4a';
  const dest = `${PLAY_DIR}${id}.${ext}`;
  await FileSystem.writeAsStringAsync(dest, payload.audio, { encoding: 'base64' });
  await playVoiceFile(dest);
}

export async function clearVoicePlaybackCache() {
  await stopVoicePlayback().catch(() => undefined);
  await wipeVoiceTemps().catch(() => undefined);
  await FileSystem.deleteAsync(PLAY_DIR, { idempotent: true }).catch(() => undefined);
}
