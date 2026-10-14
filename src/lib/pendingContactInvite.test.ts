// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import {
  clearPendingContactInvite,
  loadPendingContactInvite,
  savePendingContactInvite,
} from './pendingContactInvite';

describe('pending contact invite', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a valid token and reloads it within seven days', async () => {
    const token = 'd'.repeat(64);
    await savePendingContactInvite(token);
    expect(await loadPendingContactInvite()).toBe(token);
  });

  it('rejects invalid tokens and clears expired pending invites', async () => {
    await savePendingContactInvite('not-a-token');
    expect(await loadPendingContactInvite()).toBeNull();

    const token = 'e'.repeat(64);
    await savePendingContactInvite(token);
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
    expect(await loadPendingContactInvite()).toBeNull();
    await clearPendingContactInvite();
    expect(await loadPendingContactInvite()).toBeNull();
  });
});
