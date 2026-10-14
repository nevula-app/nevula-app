// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * OEM push / background survival hints
 *
 * What Android can detect:
 * - Manufacturer / brand (`Platform.constants`) — used to gate UI.
 * - Battery optimization exemption (`PowerManager.isIgnoringBatteryOptimizations`) —
 *   exposed via NevulaLauncherIcon when available.
 * - Autostart / “Managed manually” / protected-apps — **not** readable via public APIs
 *   on Honor/Huawei (and most OEMs). We only remember that the user dismissed or opened
 *   settings (`nevula.oemPushHint.v1`).
 *
 * Who typically needs Autostart / protected-apps (Honor-style dialog):
 * - Honor / HiHonor / Huawei — aggressive force-stop; FCM often only after manual open
 *   unless Autostart + battery unrestricted.
 *
 * Who may need battery exemption only (no Honor Autostart dialog here):
 * - Xiaomi / Redmi / POCO, Oppo / Realme, Vivo / iQOO — own battery UIs; we still call
 *   the standard IGNORE_BATTERY_OPTIMIZATIONS intent when enabling push, but do not
 *   show the Honor Autostart copy.
 *
 * Stock / Pixel / most Samsung: system battery dialog only if not already exempt;
 *   no Autostart nag.
 */

const HINT_ACK_KEY = 'nevula.oemPushHint.v1';

type NativeBattery = {
  isIgnoringBatteryOptimizations?(): Promise<boolean>;
};

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<NativeBattery>('NevulaLauncherIcon')
  : null;

function androidBrandBlob(): string {
  const c = Platform.constants as { Brand?: string; Manufacturer?: string; Model?: string };
  return `${c.Brand ?? ''} ${c.Manufacturer ?? ''}`.toLowerCase();
}

/** Honor / Huawei family — Autostart / Managed-manually UI is relevant. */
export function isHonorHuaweiFamily(): boolean {
  if (Platform.OS !== 'android') return false;
  const blob = androidBrandBlob();
  return (
    blob.includes('honor')
    || blob.includes('huawei')
    || blob.includes('hihonor')
  );
}

export async function hasAcknowledgedOemPushHint(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(HINT_ACK_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function acknowledgeOemPushHint(): Promise<void> {
  try {
    await SecureStore.setItemAsync(HINT_ACK_KEY, '1');
  } catch {
    // Non-fatal — worst case the hint may show again.
  }
}

export async function isBatteryUnrestricted(): Promise<boolean | null> {
  if (!native?.isIgnoringBatteryOptimizations) return null;
  try {
    return Boolean(await native.isIgnoringBatteryOptimizations());
  } catch {
    return null;
  }
}

/**
 * Show the Honor/Huawei Autostart dialog only when:
 * - device is Honor/Huawei family, and
 * - user has not already dismissed / opened settings for this hint.
 * Battery exemption is requested separately (and is a no-op when already granted).
 */
export async function shouldShowHonorOemPushDialog(): Promise<boolean> {
  if (!isHonorHuaweiFamily()) return false;
  if (await hasAcknowledgedOemPushHint()) return false;
  return true;
}
