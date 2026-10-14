// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

function hiddenKey(userId: string) {
  return `nevula.hidden.messages.${userId}`;
}

export async function loadHiddenMessageIds(userId: string): Promise<string[]> {
  const stored = await SecureStore.getItemAsync(hiddenKey(userId));
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function hideMessageForMe(userId: string, messageId: string) {
  const ids = await loadHiddenMessageIds(userId);
  if (ids.includes(messageId)) return;
  ids.push(messageId);
  await SecureStore.setItemAsync(hiddenKey(userId), JSON.stringify(ids), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function wipeHiddenMessages(userId: string) {
  await SecureStore.deleteItemAsync(hiddenKey(userId)).catch(() => undefined);
}
