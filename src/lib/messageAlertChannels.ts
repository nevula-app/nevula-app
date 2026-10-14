// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'nevula-messages';
const BADGE_CHANNEL_ID = 'nevula-messages-badge';

/** Create Android channels early so FCM can post when the app is killed. */
export async function ensureMessageAlertChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Calculator',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#2878ff',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
  await Notifications.setNotificationChannelAsync(BADGE_CHANNEL_ID, {
    name: 'Calculator badge',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
    bypassDnd: false,
    showBadge: true,
  });
}

export { CHANNEL_ID, BADGE_CHANNEL_ID };
