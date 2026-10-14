// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

export type LocalContact = {
  userId: string;
  nevulaId: string;
  displayName: string | null;
  conversationId: string;
  legacyConversationId?: string;
};

function storeKey(userId: string) {
  return `nevula.local.contacts.${userId}`;
}

export function localConversationId(myUserId: string, peerUserId: string) {
  const [a, b] = [myUserId, peerUserId].sort();
  return `nvl3:${a}:${b}`;
}

export function isLocalConversationId(conversationId: string) {
  return conversationId.startsWith('nvl3:');
}

async function loadAll(userId: string): Promise<Record<string, LocalContact>> {
  const stored = await SecureStore.getItemAsync(storeKey(userId));
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, LocalContact] => {
      const value = entry[1] as LocalContact;
      return Boolean(value?.userId && value?.nevulaId && value?.conversationId);
    }));
  } catch {
    return {};
  }
}

async function saveAll(userId: string, all: Record<string, LocalContact>) {
  await SecureStore.setItemAsync(storeKey(userId), JSON.stringify(all), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadLocalContacts(userId: string): Promise<LocalContact[]> {
  return Object.values(await loadAll(userId));
}

export async function replaceLocalContacts(userId: string, contacts: LocalContact[]) {
  const restored = Object.fromEntries(contacts
    .filter(contact => contact.userId && contact.nevulaId)
    .map(contact => [contact.userId, {
      ...contact,
      conversationId: localConversationId(userId, contact.userId),
    }]));
  await saveAll(userId, restored);
}

export async function removeLocalContact(userId: string, contactUserId: string) {
  const all = await loadAll(userId);
  if (!all[contactUserId]) return;
  delete all[contactUserId];
  await saveAll(userId, all);
  import('./identityRecovery').then(({ syncIdentityRecoveryBackup }) => syncIdentityRecoveryBackup()).catch(() => undefined);
}

export async function saveLocalContact(userId: string, contact: LocalContact) {
  const all = await loadAll(userId);
  const previous = all[contact.userId];
  all[contact.userId] = {
    ...previous,
    ...contact,
    conversationId: localConversationId(userId, contact.userId),
    legacyConversationId: contact.legacyConversationId ?? previous?.legacyConversationId,
  };
  await saveAll(userId, all);
  import('./identityRecovery').then(({ syncIdentityRecoveryBackup }) => syncIdentityRecoveryBackup()).catch(() => undefined);
}

export async function wipeLocalContacts(userId: string) {
  await SecureStore.deleteItemAsync(storeKey(userId)).catch(() => undefined);
}
