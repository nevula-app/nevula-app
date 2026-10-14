// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

function aliasesKey(userId: string) {
  return `nevula.contact.aliases.${userId}`;
}

export async function loadContactAliases(userId: string): Promise<Record<string, string>> {
  const stored = await SecureStore.getItemAsync(aliasesKey(userId));
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export async function saveContactAlias(userId: string, contactUserId: string, alias: string) {
  const aliases = await loadContactAliases(userId);
  const normalized = alias.trim().slice(0, 40);
  if (normalized) aliases[contactUserId] = normalized;
  else delete aliases[contactUserId];
  await SecureStore.setItemAsync(aliasesKey(userId), JSON.stringify(aliases), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return normalized;
}
