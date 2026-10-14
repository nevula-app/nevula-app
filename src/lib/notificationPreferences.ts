// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

const KEY = 'nevula.notification.preferences.v2';
const BADGE_KEY = 'nevula.notification.badge.v1';

export const DISGUISED_NOTIFICATION_TEXTS = [
  'Please return to your calculator.',
  'You still have an open calculation to complete.',
  'Your calculator is waiting for you.',
] as const;

export type DisguisedNotificationText = typeof DISGUISED_NOTIFICATION_TEXTS[number];

export type NotificationPreferences = {
  enabled: boolean;
  calendarReminders: boolean;
  messageAlerts: boolean;
  /** Optional Calculator-style push when someone sends a pairing request. */
  contactRequests: boolean;
  badgeOnly: boolean;
  disguisedText: DisguisedNotificationText;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  calendarReminders: true,
  messageAlerts: true,
  contactRequests: true,
  badgeOnly: false,
  disguisedText: DISGUISED_NOTIFICATION_TEXTS[0],
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const stored = JSON.parse(raw) as Partial<NotificationPreferences>;
    const disguisedText = DISGUISED_NOTIFICATION_TEXTS.includes(stored.disguisedText as DisguisedNotificationText)
      ? stored.disguisedText as DisguisedNotificationText
      : DEFAULT_NOTIFICATION_PREFERENCES.disguisedText;
    const enabled = stored.enabled === true;
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...stored,
      enabled,
      // Legacy: separate Messages toggle removed — push on always covers messages.
      messageAlerts: enabled ? true : stored.messageAlerts === true,
      disguisedText,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(preferences), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function wipeNotificationPreferences() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(BADGE_KEY).catch(() => undefined),
  ]);
}

export async function incrementNotificationBadge() {
  const current = Math.max(0, Number(await SecureStore.getItemAsync(BADGE_KEY)) || 0);
  const next = Math.min(99, current + 1);
  await SecureStore.setItemAsync(BADGE_KEY, String(next), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return next;
}

export async function clearStoredNotificationBadge() {
  await SecureStore.deleteItemAsync(BADGE_KEY).catch(() => undefined);
}
