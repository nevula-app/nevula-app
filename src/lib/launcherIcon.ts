// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type LauncherIconMode = 'nevula' | 'calculator';

const STORAGE_KEY = 'nevula.launcherIconMode';

type NativeLauncherIcon = {
  setIcon(mode: LauncherIconMode): Promise<void>;
  presentCalculatorAlert?(title: string, body: string, badgeOnly: boolean): Promise<void>;
  requestUnrestrictedBattery?(): Promise<void>;
  openOemPushSettings?(): Promise<void>;
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
  openExternalApp?(packageName: string): Promise<boolean>;
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeLauncherIcon>('NevulaLauncherIcon')
  : null;

export async function loadLauncherIconMode(): Promise<LauncherIconMode | null> {
  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  return value === 'nevula' || value === 'calculator' ? value : null;
}

export async function saveLauncherIconMode(mode: LauncherIconMode): Promise<void> {
  // Persist first because some Android launchers briefly recreate the task while
  // refreshing the icon.
  await SecureStore.setItemAsync(STORAGE_KEY, mode);
  if (native) await native.setIcon(mode);
}

/** Sync SharedPreferences used by FCM so notification icons match Appearance. */
export async function syncLauncherIconToNative(): Promise<void> {
  if (!native) return;
  const mode = await loadLauncherIconMode();
  if (mode) await native.setIcon(mode);
}

/** Appearance-aware Calculator OS banner (Android). Falls back to expo-notifications. */
export async function presentNativeCalculatorAlert(
  title: string,
  body: string,
  badgeOnly: boolean,
): Promise<boolean> {
  if (!native?.presentCalculatorAlert) return false;
  try {
    await native.presentCalculatorAlert(title, body, badgeOnly);
    return true;
  } catch {
    return false;
  }
}

/** Ask Android to exempt NEVULA from battery kill (needed for FCM on Honor). */
export async function requestUnrestrictedBattery(): Promise<void> {
  if (!native?.requestUnrestrictedBattery) return;
  await native.requestUnrestrictedBattery().catch(() => undefined);
}

/** Open Honor/Huawei startup / app-details so FCM is not force-killed. */
export async function openOemPushSettings(): Promise<void> {
  if (!native?.openOemPushSettings) return;
  await native.openOemPushSettings().catch(() => undefined);
}

/** Launch another installed app by package name (e.g. Orbot). */
export async function openExternalAndroidApp(packageName: string): Promise<boolean> {
  if (!native?.openExternalApp || !packageName) return false;
  try {
    return Boolean(await native.openExternalApp(packageName));
  } catch {
    return false;
  }
}
