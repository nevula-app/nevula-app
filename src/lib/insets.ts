// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Dimensions, Platform, StatusBar } from 'react-native';

export function androidBottomInset() {
  if (Platform.OS !== 'android') return 0;
  const screen = Dimensions.get('screen').height;
  const window = Dimensions.get('window').height;
  const status = StatusBar.currentHeight ?? 0;
  const covered = screen - window;
  const nav = covered > status + 8 ? covered - status : 0;
  return Math.max(52, Math.min(72, nav || 52));
}
