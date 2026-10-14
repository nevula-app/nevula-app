// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Platform, StatusBar } from 'react-native';

/**
 * Empty strip under the OS status icons (battery, clock, …).
 * Android SafeAreaView does not pad the top; StatusBar.currentHeight alone is often too tight on Honor/Huawei.
 */
export function androidStatusInset(extra = 10): number {
  if (Platform.OS !== 'android') return 0;
  return Math.max(StatusBar.currentHeight ?? 0, 28) + extra;
}
