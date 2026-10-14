// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type VoiceMode = 'robot' | 'chatter' | 'synthetic';

export type DisguiseResult = {
  uri: string;
  durationMs: number;
  mime: string;
};

type NativeVoice = {
  prepareEngine(): Promise<void>;
  startRecording(): Promise<void>;
  stopAndDisguise(mode: string): Promise<DisguiseResult>;
  cancelRecording(): Promise<void>;
  play(uri: string): Promise<void>;
  stopPlayback(): Promise<void>;
  wipeTemps(): Promise<void>;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeVoice>('NevulaVoice') : null;

export function isVoiceCaptureAvailable() {
  return native != null;
}

function requireNative() {
  if (!native) throw new Error('Voice messages need the native NEVULA Android build.');
  return native;
}

export async function prepareVoiceEngine() {
  if (!native) return;
  await native.prepareEngine();
}

export async function startVoiceRecording() {
  await requireNative().startRecording();
}

export async function stopAndDisguiseVoice(mode: VoiceMode): Promise<DisguiseResult> {
  return requireNative().stopAndDisguise(mode);
}

export async function cancelVoiceRecording() {
  if (!native) return;
  await native.cancelRecording();
}

export async function playVoiceFile(uri: string) {
  await requireNative().play(uri);
}

export async function stopVoicePlayback() {
  if (!native) return;
  await native.stopPlayback();
}

export async function wipeVoiceTemps() {
  if (!native) return;
  await native.wipeTemps();
}
