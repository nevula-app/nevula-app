// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

import { encryptForRecipients } from './pgp';

describe('OpenPGP legacy isolation', () => {
  it('refuses new OpenPGP chat encryption (deniability / PFS)', async () => {
    await expect(encryptForRecipients('nope', ['dummy'])).rejects.toThrow(/OpenPGP chat encryption is disabled/);
  });

  it('keeps decryptFromSender exported for historical messages only', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'pgp.ts'), 'utf8');
    expect(src).toMatch(/export async function decryptFromSender/);
    expect(src).toMatch(/OpenPGP chat encryption is disabled/);
    expect(src).not.toMatch(/signingKeys:\s*signingKey/);
  });
});
