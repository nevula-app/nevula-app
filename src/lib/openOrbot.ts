// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform } from 'react-native';
import { openExternalAndroidApp } from './launcherIcon';

const ORBOT_PACKAGES = [
  'org.torproject.android',
  'org.torproject.android.debug',
];

/**
 * Open the installed Orbot app on this phone.
 * Uses PackageManager launch only — never falls through to the Play Store.
 */
export async function openOrbotApp(): Promise<'opened' | 'failed'> {
  if (Platform.OS !== 'android') return 'failed';
  for (const pkg of ORBOT_PACKAGES) {
    if (await openExternalAndroidApp(pkg)) return 'opened';
  }
  return 'failed';
}
