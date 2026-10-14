// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { nevTorManager } from './manager';
import type { NevTorSnapshot } from './types';

export function useNevTorSnapshot(): NevTorSnapshot {
  const [snapshot, setSnapshot] = useState<NevTorSnapshot>(() => nevTorManager.getSnapshot());

  useEffect(() => {
    let cancelled = false;
    void nevTorManager.bootstrap().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    const unsub = nevTorManager.subscribe((next) => {
      if (!cancelled) setSnapshot(next);
    });
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void nevTorManager.refresh();
    });
    return () => {
      cancelled = true;
      unsub();
      appSub.remove();
    };
  }, []);

  return snapshot;
}
