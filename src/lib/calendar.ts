// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getNotificationPreferences, NotificationPreferences } from './notificationPreferences';
import { decryptUtf8, encryptUtf8 } from './localCrypto';

const EVENTS_FILE = `${FileSystem.documentDirectory}nevula-calendar.json`;
const CHANNEL_ID = 'calculator-reminders';
const BADGE_CHANNEL_ID = 'calculator-badge';
const MAX_SCHEDULED_OCCURRENCES = 32;

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  /** Optional end time (ISO). Null/omit = no explicit duration. */
  endsAt: string | null;
  notes: string;
  /** Minutes before startsAt. Null = no minutes-before reminder. */
  reminderMinutes: number | null;
  /** Absolute reminder clock time (ISO). Takes priority over reminderMinutes when set. */
  reminderAt: string | null;
  repeatEveryDays: number | null;
  notificationIds: string[];
  createdAt: string;
};

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const badgeOnly = notification.request.content.data?.badgeOnly === true;
    return {
      shouldPlaySound: !badgeOnly,
      shouldSetBadge: true,
      shouldShowBanner: !badgeOnly,
      shouldShowList: !badgeOnly,
    };
  },
});

export async function prepareCalendarNotifications() {
  if (Platform.OS !== 'android') return;
  await Notifications.deleteNotificationChannelAsync('nevula-calendar').catch(() => undefined);
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Calculator',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#2878ff',
  });
  await Notifications.setNotificationChannelAsync(BADGE_CHANNEL_ID, {
    name: 'Calculator badge',
    importance: Notifications.AndroidImportance.MIN,
    showBadge: true,
    sound: null,
    vibrationPattern: null,
  });
}

export async function requestReminderPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return false;
  }
  await prepareCalendarNotifications();
  return true;
}

export async function loadCalendarEvents(): Promise<CalendarEvent[]> {
  const info = await FileSystem.getInfoAsync(EVENTS_FILE);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(EVENTS_FILE);
  const normalize = (list: any[]): CalendarEvent[] =>
    list.map(event => ({
      ...event,
      endsAt: event.endsAt ?? null,
      reminderAt: event.reminderAt ?? null,
      reminderMinutes: event.reminderMinutes ?? null,
    }));
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const next = normalize(parsed);
      await persist(next);
      return next;
    }
  } catch {
    try {
      const parsed = JSON.parse(await decryptUtf8(raw));
      return Array.isArray(parsed) ? normalize(parsed) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function persist(events: CalendarEvent[]) {
  await FileSystem.writeAsStringAsync(EVENTS_FILE, await encryptUtf8(JSON.stringify(events)));
}

async function cancelNotifications(ids: string[]) {
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

async function scheduleNotifications(event: CalendarEvent, suppliedPreferences?: NotificationPreferences) {
  const preferences = suppliedPreferences ?? await getNotificationPreferences();
  const hasReminder = event.reminderAt != null || event.reminderMinutes !== null;
  if (!hasReminder || !preferences.enabled || !preferences.calendarReminders) return [];
  const ids: string[] = [];
  const start = new Date(event.startsAt);
  const now = Date.now();
  const repeatMs = (event.repeatEveryDays ?? 0) * 86_400_000;
  const firstOccurrence = repeatMs ? Math.max(0, Math.floor((now - start.getTime()) / repeatMs)) : 0;
  for (let index = 0; index < MAX_SCHEDULED_OCCURRENCES; index += 1) {
    const occurrence = firstOccurrence + index;
    const occurrenceStart = new Date(start);
    occurrenceStart.setDate(start.getDate() + occurrence * (event.repeatEveryDays ?? 0));
    let triggerAt: Date;
    if (event.reminderAt) {
      const abs = new Date(event.reminderAt);
      if (event.repeatEveryDays) {
        // Keep clock time of reminderAt, shifted to this occurrence's calendar day offset from first start.
        const baseRem = new Date(event.reminderAt);
        const dayDelta = Math.round((occurrenceStart.getTime() - start.getTime()) / 86_400_000);
        triggerAt = new Date(baseRem);
        triggerAt.setDate(baseRem.getDate() + dayDelta);
      } else {
        triggerAt = abs;
      }
    } else {
      triggerAt = new Date(occurrenceStart.getTime() - (event.reminderMinutes ?? 0) * 60_000);
    }
    if (triggerAt.getTime() > now) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Calculator',
          body: preferences.badgeOnly ? '' : preferences.disguisedText,
          data: { eventId: event.id, badgeOnly: preferences.badgeOnly },
          sound: preferences.badgeOnly ? false : true,
          badge: 1,
        },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerAt, channelId: preferences.badgeOnly ? BADGE_CHANNEL_ID : CHANNEL_ID },
      });
      ids.push(id);
    }
    if (!event.repeatEveryDays) break;
  }
  return ids;
}

export async function saveCalendarEvent(events: CalendarEvent[], input: Omit<CalendarEvent, 'notificationIds' | 'createdAt'>) {
  const existing = events.find(event => event.id === input.id);
  if (existing) await cancelNotifications(existing.notificationIds);
  const draft: CalendarEvent = { ...input, notificationIds: [], createdAt: existing?.createdAt ?? new Date().toISOString() };
  draft.notificationIds = await scheduleNotifications(draft);
  const next = [...events.filter(event => event.id !== draft.id), draft].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  await persist(next);
  return next;
}

export async function deleteCalendarEvent(events: CalendarEvent[], id: string) {
  const existing = events.find(event => event.id === id);
  if (existing) await cancelNotifications(existing.notificationIds);
  const next = events.filter(event => event.id !== id);
  await persist(next);
  return next;
}

export async function rescheduleAllCalendarNotifications() {
  const events = await loadCalendarEvents();
  const preferences = await getNotificationPreferences();
  const next: CalendarEvent[] = [];
  for (const event of events) {
    await cancelNotifications(event.notificationIds);
    next.push({ ...event, notificationIds: await scheduleNotifications(event, preferences) });
  }
  await persist(next);
  return next;
}

export async function refillUpcomingReminders() {
  return rescheduleAllCalendarNotifications();
}

export function eventOccursOn(event: CalendarEvent, date: Date) {
  const start = new Date(event.startsAt);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const difference = Math.round((target.getTime() - first.getTime()) / 86_400_000);
  if (difference < 0) return false;
  return difference === 0 || (!!event.repeatEveryDays && difference % event.repeatEveryDays === 0);
}

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function wipeCalendar() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await FileSystem.deleteAsync(EVENTS_FILE, { idempotent: true });
}
