// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase, nevulaRawFetch } from './supabase';
import {
  DISGUISED_NOTIFICATION_TEXTS,
  getNotificationPreferences,
  type DisguisedNotificationText,
  type NotificationPreferences,
} from './notificationPreferences';
import { requestReminderPermission } from './calendar';
import { ensureMessageAlertChannels } from './messageAlertChannels';
import { syncLauncherIconToNative } from './launcherIcon';

const TOKEN_KEY_HINT = 'nevula.remotePush.token.v1';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

function allowedText(value: string | undefined): DisguisedNotificationText {
  if (DISGUISED_NOTIFICATION_TEXTS.includes(value as DisguisedNotificationText)) {
    return value as DisguisedNotificationText;
  }
  return DISGUISED_NOTIFICATION_TEXTS[0];
}

async function sessionAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Clearnet REST for push plumbing — must not wait on NevTOR/Orbot.
 * (Wake text is Calculator disguise only; never message bodies.)
 */
async function pushClearnetFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await sessionAccessToken();
  if (!token) throw new Error('no-session');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('supabase-config');
  return nevulaRawFetch(`${SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
      'content-type': 'application/json',
    },
  });
}

/**
 * Registers this device for remote FCM (Calculator disguise only).
 * Requires google-services.json in the Android build + FCM secrets on the Edge Function.
 */
export async function registerRemotePushToken(
  userId: string,
  preferences?: NotificationPreferences,
): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS !== 'android') return { ok: false, reason: 'android-only' };
  if (!userId) return { ok: false, reason: 'no-user' };

  const prefs = preferences ?? await getNotificationPreferences();
  if (!prefs.enabled) {
    await unregisterRemotePushTokens(userId).catch(() => undefined);
    return { ok: false, reason: 'disabled' };
  }

  const permitted = await requestReminderPermission().catch(() => false);
  if (!permitted) return { ok: false, reason: 'permission' };

  // Channels must exist before a killed-app FCM notification arrives (Honor/Huawei).
  await ensureMessageAlertChannels().catch(() => undefined);
  // Appearance SharedPreferences → notification small/large icons for FCM service.
  await syncLauncherIconToNative().catch(() => undefined);

  let token: string | null = null;
  try {
    // Always use the native FCM device token so the Edge Function talks to Google directly
    // (Expo push tokens need an EAS project + Expo FCM credentials we do not use).
    const device = await Notifications.getDevicePushTokenAsync();
    token = typeof device.data === 'string' ? device.data : null;
  } catch (error: any) {
    const message = String(error?.message ?? error ?? '');
    if (/google-services|Firebase|FCM|DEFAULT_APP|messaging/i.test(message)) {
      return { ok: false, reason: 'firebase-missing' };
    }
    return { ok: false, reason: message.slice(0, 120) || 'token-failed' };
  }
  if (!token) return { ok: false, reason: 'token-empty' };

  try {
    const res = await pushClearnetFetch('/rest/v1/device_push_tokens?on_conflict=user_id,token', {
      method: 'POST',
      headers: {
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform: 'android',
        badge_only: prefs.badgeOnly === true,
        disguised_text: allowedText(prefs.disguisedText),
        enabled: true,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/device_push_tokens|schema cache|does not exist/i.test(text)) {
        return { ok: false, reason: 'table-missing' };
      }
      return { ok: false, reason: text.slice(0, 120) || `upsert-${res.status}` };
    }
  } catch (error: any) {
    const message = String(error?.message ?? error ?? '');
    if (/no-session/i.test(message)) return { ok: false, reason: 'no-session' };
    return { ok: false, reason: message.slice(0, 120) || 'upsert-failed' };
  }

  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(TOKEN_KEY_HINT, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } catch {
    // Hint is optional (used to delete the prior token on wipe).
  }
  return { ok: true };
}

export async function unregisterRemotePushTokens(userId: string) {
  if (!userId) return;
  let hinted: string | null = null;
  try {
    const SecureStore = await import('expo-secure-store');
    hinted = await SecureStore.getItemAsync(TOKEN_KEY_HINT);
    await SecureStore.deleteItemAsync(TOKEN_KEY_HINT).catch(() => undefined);
  } catch {
    // ignore
  }
  try {
    if (hinted) {
      await pushClearnetFetch(
        `/rest/v1/device_push_tokens?user_id=eq.${encodeURIComponent(userId)}&token=eq.${encodeURIComponent(hinted)}`,
        { method: 'DELETE' },
      ).catch(() => undefined);
    }
    await pushClearnetFetch(
      `/rest/v1/device_push_tokens?user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ).catch(() => undefined);
  } catch {
    // Best-effort; fall back to gated client.
    if (hinted) {
      await supabase.from('device_push_tokens').delete().eq('user_id', userId).eq('token', hinted).catch(() => undefined);
    }
    await supabase.from('device_push_tokens').delete().eq('user_id', userId).catch(() => undefined);
  }
}

/** Ask the server to wake the recipient with a Calculator push (no message body). */
export async function requestRemoteMessagePush(recipientUserId: string): Promise<boolean> {
  if (!recipientUserId) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  if (session.user.id === recipientUserId) return false;

  const attempt = async (): Promise<boolean> => {
    const res = await Promise.race([
      pushClearnetFetch('/functions/v1/notify-message-push', {
        method: 'POST',
        body: JSON.stringify({ recipientId: recipientUserId }),
      }),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), 12_000);
      }),
    ]);
    if (!res) return false;
    if (!res.ok) return false;
    try {
      const payload = await res.json() as { ok?: boolean; sent?: number };
      return payload.ok === true && Number(payload.sent ?? 0) > 0;
    } catch {
      return true;
    }
  };

  if (await attempt().catch(() => false)) return true;
  await new Promise(r => setTimeout(r, 600));
  return attempt().catch(() => false);
}
