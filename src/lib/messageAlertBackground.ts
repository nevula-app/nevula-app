// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const MESSAGE_INBOX_BACKGROUND_TASK = 'nevula-message-inbox-fetch';

let defined = false;

/** Must run at app load (before React) so Android can wake the JS task. */
export function defineMessageInboxBackgroundTask() {
  if (defined) return;
  defined = true;
  TaskManager.defineTask(MESSAGE_INBOX_BACKGROUND_TASK, async () => {
    try {
      const { runMessageInboxBackgroundCheck } = await import('./messageAlerts');
      const found = await runMessageInboxBackgroundCheck();
      return found
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerMessageInboxBackgroundFetch() {
  if (Platform.OS !== 'android') return;
  defineMessageInboxBackgroundTask();
  const status = await BackgroundFetch.getStatusAsync().catch(() => null);
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted
    || status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }
  const already = await TaskManager.isTaskRegisteredAsync(MESSAGE_INBOX_BACKGROUND_TASK).catch(() => false);
  if (already) return;
  // Hint only — OEM (Honor/Huawei) may still delay; keep interval low so we wake sooner when allowed.
  await BackgroundFetch.registerTaskAsync(MESSAGE_INBOX_BACKGROUND_TASK, {
    minimumInterval: 60,
    stopOnTerminate: false,
    startOnBoot: true,
  }).catch(() => undefined);
}
