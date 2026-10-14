// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Alert, Linking } from 'react-native';
import { clearAppLockHold, holdAppLock } from './appLock';

type DevicePermission = {
  granted: boolean;
  canAskAgain?: boolean;
};

/**
 * Asks Android on this phone. No network call.
 * The system sheet backgrounds the app, so the vault lock is held until it returns.
 */
export async function askDevicePermission(
  current: DevicePermission | null | undefined,
  request: () => Promise<DevicePermission>,
  noun: string,
): Promise<boolean> {
  if (current?.granted) return true;
  holdAppLock(60_000);
  try {
    const next = current?.canAskAgain === false ? current : await request();
    if (next?.granted) return true;
    const blocked = next?.canAskAgain === false;
    Alert.alert(
      `${noun} access needed`,
      blocked
        ? `Allow ${noun.toLowerCase()} access in phone settings. The request stays on this phone.`
        : `Allow ${noun.toLowerCase()} access to continue. The request stays on this phone.`,
      blocked
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
          ]
        : [{ text: 'OK' }],
    );
    return false;
  } finally {
    clearAppLockHold();
  }
}
