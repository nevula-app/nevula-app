// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { toSecureStoreKey } from './secureStoreKey';

describe('toSecureStoreKey', () => {
  it('keeps alphanumeric, dots, hyphens, and underscores', () => {
    expect(toSecureStoreKey('nevula', 'retention', 'chat', 'user-id', 'peer_id')).toBe(
      'nevula.retention.chat.user-id.peer_id',
    );
  });

  it('sanitizes conversation ids that contain colons', () => {
    const conversationId = 'nvl3:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee:ffffffff-1111-4222-8333-444444444444';
    const key = toSecureStoreKey('nevula', 'retention', 'chat', 'me-id', conversationId);
    expect(key).toMatch(/^[\w.-]+$/);
    expect(key).not.toContain(':');
    expect(key).toContain('nvl3_');
  });

  it('rejects an empty key', () => {
    expect(() => toSecureStoreKey()).toThrow(/empty/i);
    expect(() => toSecureStoreKey('', '', '')).toThrow(/empty/i);
  });
});
