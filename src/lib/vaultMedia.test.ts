// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: null,
  documentDirectory: null,
}));
vi.mock('./messaging', () => ({ sendEncryptedMessage: async () => undefined }));
vi.mock('./media', () => ({ revealVaultItem: async () => '' }));

import { encodeVaultMediaPayload, parseVaultMediaPayload } from './vaultMedia';

describe('vault chat media', () => {
  it('round-trips a vault photo payload', () => {
    const encoded = encodeVaultMediaPayload({
      mediaKind: 'photo',
      fileName: 'Photo.jpg',
      mime: 'image/jpeg',
      bytes: 'aGVsbG8tdmF1bHQtcGhvdG8tZGF0YQ==',
    });
    const parsed = parseVaultMediaPayload(encoded);
    expect(parsed?.mediaKind).toBe('photo');
    expect(parsed?.bytes.length).toBeGreaterThan(8);
  });

  it('ignores ordinary chat text', () => {
    expect(parseVaultMediaPayload('hello')).toBeNull();
  });
});
