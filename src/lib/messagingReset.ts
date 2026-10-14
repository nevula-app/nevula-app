// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { wipeAllOutboxes } from './outbox';
import { wipeAllSealedInboxes } from './sealedInbox';
import { wipeInAppUnread } from './inAppUnread';
import { wipeRatchetSessions } from './sessionRatchet';
import { purgeOwnSealedInboxOnServer } from './sessionPrivacy';
import { clearStoredNotificationBadge } from './notificationPreferences';
import { wipeHiddenMessages } from './hiddenMessages';
import * as Notifications from 'expo-notifications';

const RESET_FLAG = 'nevula.messaging.history.reset.v111';

/**
 * Clears local chat history, unread badges, ratchet sessions and undelivered
 * server blobs for this user — keeps contacts/pairing so a clean retest works.
 */
export async function resetMessagingHistory(userId: string) {
  await Promise.all([
    wipeAllSealedInboxes(),
    wipeAllOutboxes(),
    wipeInAppUnread(),
    wipeRatchetSessions(),
    wipeHiddenMessages(userId),
    purgeOwnSealedInboxOnServer(userId),
    clearStoredNotificationBadge(),
  ]);
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
}

/** Runs once per install flag so both phones start from an empty thread. */
export async function resetMessagingHistoryOnce(userId: string) {
  const done = await SecureStore.getItemAsync(RESET_FLAG);
  if (done === '1') return false;
  await resetMessagingHistory(userId);
  await SecureStore.setItemAsync(RESET_FLAG, '1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return true;
}

export async function clearMessagingResetFlag() {
  await SecureStore.deleteItemAsync(RESET_FLAG).catch(() => undefined);
}
