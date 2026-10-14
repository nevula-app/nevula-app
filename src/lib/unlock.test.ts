// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { store.delete(key); }),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}));

import * as unlock from './unlock';
import {
  isPinAttempt,
  loadUnlockCode,
  loadWipeCode,
  PIN_POLICY,
  pinError,
  wipePinError,
} from './unlock';

describe('production PIN policy', () => {
  beforeEach(() => store.clear());

  it('rejects 2580 and 1234 as setup codes', () => {
    expect(pinError('2580')).toBe(PIN_POLICY);
    expect(wipePinError('1234')).toBe(PIN_POLICY);
    expect(pinError('0000')).toBe(PIN_POLICY);
    expect(pinError('123456−')).toBeNull();
    expect(wipePinError('123456+')).toBeNull();
  });

  it('does not write an unlock or wipe code on startup', async () => {
    expect(await loadUnlockCode()).toBeNull();
    expect(await loadWipeCode()).toBeNull();
    expect(unlock).not.toHaveProperty('seedTestAccessPinsIfNeeded');
    expect(unlock).not.toHaveProperty('GRANDFATHERED_CODE');
    expect(unlock).not.toHaveProperty('GRANDFATHERED_WIPE_CODE');
  });

  it('does not accept 2580, 1234, or any short fallback even when those values are stored', () => {
    expect(isPinAttempt('2580', '2580')).toBe(false);
    expect(isPinAttempt('1234', '1234')).toBe(false);
    expect(isPinAttempt('9999', '2580')).toBe(false);
    expect(isPinAttempt('123456', '123456−')).toBe(false);
    expect(isPinAttempt('123456−', '123456−')).toBe(true);
  });
});
