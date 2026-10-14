// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import type { VoiceMode } from './voiceMessages';

function modulationKey(userId: string) {
  return `nevula.chat.modulation.${userId}`;
}

function isVoiceMode(value: unknown): value is VoiceMode {
  return value === 'robot' || value === 'chatter' || value === 'synthetic';
}

async function loadAll(userId: string): Promise<Record<string, VoiceMode>> {
  const stored = await SecureStore.getItemAsync(modulationKey(userId));
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, VoiceMode] => isVoiceMode(entry[1])),
    );
  } catch {
    return {};
  }
}

export async function loadChatModulation(userId: string, conversationId: string): Promise<VoiceMode | null> {
  const all = await loadAll(userId);
  return all[conversationId] ?? null;
}

export async function saveChatModulation(userId: string, conversationId: string, mode: VoiceMode) {
  const all = await loadAll(userId);
  all[conversationId] = mode;
  await SecureStore.setItemAsync(modulationKey(userId), JSON.stringify(all), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
