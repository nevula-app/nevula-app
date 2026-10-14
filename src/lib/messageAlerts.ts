// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as Notifications from 'expo-notifications';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';
import { getNotificationPreferences, incrementNotificationBadge } from './notificationPreferences';
import { requestReminderPermission } from './calendar';
import {
  getInAppUnreadCount,
  hasInAppUnreadId,
  isNvl3ChatBlobCiphertext,
} from './inAppUnread';
import { registerMessageInboxBackgroundFetch } from './messageAlertBackground';
import { CHANNEL_ID, BADGE_CHANNEL_ID, ensureMessageAlertChannels } from './messageAlertChannels';
import { presentNativeCalculatorAlert, loadLauncherIconMode } from './launcherIcon';
import { nevTorManager } from './nevtor';
import { hasSealedInboxMessage } from './sealedInbox';

const FOREGROUND_POLL_MS = 3_000;
const BACKGROUND_POLL_MS = 4_000;
const CONSUME_TIMEOUT_MS = 12_000;
const INSERT_ALERT_FALLBACK_MS = 1_800;
/** Keep waking the inbox for a few minutes after leaving the app (Honor/Huawei kill timers fast). */
const WARM_BACKGROUND_DELAYS_MS = [
  500, 1_500, 3_000, 6_000, 10_000, 16_000, 25_000, 40_000, 60_000, 90_000, 120_000, 180_000,
];

let consumeTimer: ReturnType<typeof setTimeout> | null = null;
let consumeInFlight: Promise<boolean> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let warmTimers: ReturnType<typeof setTimeout>[] = [];
const alertedBlobIds = new Set<string>();

async function appearanceAlertTitle(): Promise<string> {
  const mode = await loadLauncherIconMode().catch(() => null);
  return mode === 'calculator' ? 'Calculator' : 'NEVULA';
}

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    // Never show OS banners while NEVULA is in the foreground (dashboard/chat/…).
    const inApp = AppState.currentState === 'active';
    const badgeOnly = notification.request.content.data?.badgeOnly === true;
    return {
      shouldPlaySound: !inApp && !badgeOnly,
      shouldSetBadge: true,
      shouldShowBanner: !inApp && !badgeOnly,
      shouldShowList: !inApp && !badgeOnly,
    };
  },
});

async function prepareChannels() {
  await ensureMessageAlertChannels();
}

function messageAlertsAllowed(preferences: Awaited<ReturnType<typeof getNotificationPreferences>>) {
  return preferences.enabled;
}

function rememberAlertedBlob(blobId?: string) {
  if (!blobId) return false;
  if (alertedBlobIds.has(blobId)) return true;
  alertedBlobIds.add(blobId);
  if (alertedBlobIds.size > 80) {
    const first = alertedBlobIds.values().next().value;
    if (first) alertedBlobIds.delete(first);
  }
  return false;
}

/**
 * Discreet OS alert — only when the app is in the background / killed.
 * App-name / title follow Appearance (Calculator vs NEVULA). Disguise body stays.
 */
export async function presentDisguisedMessageAlert(_forPeerUserId?: string) {
  const preferences = await getNotificationPreferences();
  if (!messageAlertsAllowed(preferences)) return;
  if (AppState.currentState === 'active') return;

  const badge = await incrementNotificationBadge();
  await Notifications.setBadgeCountAsync(badge).catch(() => undefined);
  const title = await appearanceAlertTitle();

  await prepareChannels();
  if (preferences.badgeOnly) {
    if (await presentNativeCalculatorAlert(title, '', true)) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: '',
        sound: false,
        badge,
        data: { nevulaMessageAlert: true, badgeOnly: true },
        ...(Platform.OS === 'android' ? { channelId: BADGE_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    return;
  }

  if (await presentNativeCalculatorAlert(title, preferences.disguisedText, false)) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: preferences.disguisedText,
      sound: true,
      badge,
      data: { nevulaMessageAlert: true, badgeOnly: false },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

/**
 * OS alert for a real chat body (or INSERT fallback). Deduped per blob id.
 */
export async function notifyNewInboundChatMessage(peerUserId?: string, blobId?: string) {
  if (rememberAlertedBlob(blobId)) return;
  await presentDisguisedMessageAlert(peerUserId).catch(() => undefined);
}

/** Undecrypted server blobs → OS alert fallback only (no peerless ✉ on the dashboard). */
async function noteRemainingServerBlobs(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('message_blobs')
    .select('id')
    .eq('recipient_id', userId)
    .like('ciphertext', 'NVL3.%');
  if (error || !data?.length) return [];
  const ids: string[] = [];
  for (const row of data) {
    const id = row.id as string;
    if (!id) continue;
    if (await hasSealedInboxMessage(userId, id).catch(() => false)) continue;
    ids.push(id);
  }
  return ids;
}

async function consumeInboxAndNotify(userId: string): Promise<boolean> {
  if (consumeInFlight) return consumeInFlight;
  consumeInFlight = (async () => {
    const before = await getInAppUnreadCount().catch(() => 0);
    // Don't let a hung Tor probe block inbox forever.
    await Promise.race([
      nevTorManager.bootstrap().catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, 2_000)),
    ]);
    try {
      await nevTorManager.withInboxReceiveAllowed(async () => {
        const { consumeSealedChatBlobs } = await import('./messaging');
        await Promise.race([
          consumeSealedChatBlobs(userId),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('inbox consume timeout')), CONSUME_TIMEOUT_MS);
          }),
        ]);
      });
    } catch {
      // Timeout / network — INSERT/poll fallback alert still covers the user.
    }
    const pendingIds = await noteRemainingServerBlobs(userId).catch(() => [] as string[]);
    for (const id of pendingIds) scheduleInsertAlertFallback(id);
    // Drop peerless / stale dashboard ✉ (Honor was blinking with empty Messages).
    try {
      const { listPendingInboxBlobIds, listContacts } = await import('./messaging');
      const { listSealedInboxIds } = await import('./sealedInbox');
      const { reconcileInAppUnread } = await import('./inAppUnread');
      const [pending, sealed, contacts] = await Promise.all([
        listPendingInboxBlobIds(userId),
        listSealedInboxIds(userId),
        listContacts(userId).catch(() => [] as { userId: string }[]),
      ]);
      await reconcileInAppUnread({
        pendingServerIds: pending,
        localSealedIds: sealed,
        knownPeerIds: contacts.map(c => c.userId),
      });
    } catch {
      // Non-fatal.
    }
    const after = await getInAppUnreadCount().catch(() => before);
    return after > before;
  })()
    .catch(() => false)
    .finally(() => {
      consumeInFlight = null;
    });
  return consumeInFlight;
}

export async function consumeInboxQuiet(userId: string): Promise<boolean> {
  return consumeInboxAndNotify(userId);
}

export async function runMessageInboxBackgroundCheck(): Promise<boolean> {
  const preferences = await getNotificationPreferences();
  if (!messageAlertsAllowed(preferences)) return false;
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;
  await Promise.race([
    nevTorManager.bootstrap().catch(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, 2_000)),
  ]);
  return consumeInboxAndNotify(userId);
}

function scheduleConsume(userId: string) {
  if (consumeTimer) clearTimeout(consumeTimer);
  void consumeInboxAndNotify(userId);
  consumeTimer = setTimeout(() => {
    void consumeInboxAndNotify(userId);
  }, 700);
}

/** If decrypt is slow/blocked, still alert when the blob stays unread (recipient inbox only). */
function scheduleInsertAlertFallback(blobId: string) {
  setTimeout(() => {
    void (async () => {
      if (!(await hasInAppUnreadId(blobId).catch(() => false))) return;
      await notifyNewInboundChatMessage(undefined, blobId);
    })();
  }, INSERT_ALERT_FALLBACK_MS);
}

function clearWarmTimers() {
  for (const timer of warmTimers) clearTimeout(timer);
  warmTimers = [];
}

function scheduleWarmBackgroundChecks(userId: string) {
  clearWarmTimers();
  for (const delay of WARM_BACKGROUND_DELAYS_MS) {
    warmTimers.push(setTimeout(() => {
      void consumeInboxAndNotify(userId);
    }, delay));
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll(userId: string, backgrounded: boolean) {
  stopPoll();
  const ms = backgrounded ? BACKGROUND_POLL_MS : FOREGROUND_POLL_MS;
  pollTimer = setInterval(() => {
    void consumeInboxAndNotify(userId);
  }, ms);
}

export function startMessageAlertListener() {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let stopped = false;
  let activeUserId: string | null = null;
  let lastTorLive: boolean | null = null;

  const attach = async () => {
    const preferences = await getNotificationPreferences();
    if (preferences.enabled) {
      await requestReminderPermission().catch(() => undefined);
      await ensureMessageAlertChannels().catch(() => undefined);
      await registerMessageInboxBackgroundFetch().catch(() => undefined);
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (stopped) return;
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    const userId = session?.user.id;
    activeUserId = userId ?? null;
    if (!userId) {
      stopPoll();
      clearWarmTimers();
      return;
    }
    channel = supabase
      .channel(`nevula-message-alerts:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_blobs', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id?: string; ciphertext?: string } | null;
          if (!row?.id || !isNvl3ChatBlobCiphertext(row.ciphertext)) return;
          // Decrypt first; in-app ✉ is attached with a peer in persistOpenedBlob.
          // Peerless INSERT notes caused a blinking dashboard envelope with empty Messages.
          scheduleConsume(userId);
          scheduleInsertAlertFallback(row.id);
        },
      )
      .subscribe();
    const backgrounded = AppState.currentState !== 'active';
    startPoll(userId, backgrounded);
    void consumeInboxAndNotify(userId);
    if (backgrounded) scheduleWarmBackgroundChecks(userId);
  };

  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') {
      // Drop stale Calculator tray entries once the user is back in NEVULA.
      void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    }
    if (stopped || !activeUserId) return;
    if (state === 'active') {
      clearWarmTimers();
      startPoll(activeUserId, false);
      void consumeInboxAndNotify(activeUserId);
      return;
    }
    startPoll(activeUserId, true);
    void consumeInboxAndNotify(activeUserId);
    scheduleWarmBackgroundChecks(activeUserId);
  };

  attach();
  const appSub = AppState.addEventListener('change', onAppState);
  const torUnsub = nevTorManager.subscribe(snap => {
    if (stopped || !activeUserId) return;
    const live = snap.routingMode !== 'OFF' && snap.torReady && snap.connection === 'connected';
    if (lastTorLive === live) return;
    const was = lastTorLive;
    lastTorLive = live;
    if (live && was === false) {
      void consumeInboxAndNotify(activeUserId);
    }
  });
  const { data } = supabase.auth.onAuthStateChange(() => {
    if (!stopped) attach();
  });

  return () => {
    stopped = true;
    data.subscription.unsubscribe();
    appSub.remove();
    torUnsub();
    stopPoll();
    clearWarmTimers();
    if (consumeTimer) clearTimeout(consumeTimer);
    if (channel) supabase.removeChannel(channel);
  };
}
