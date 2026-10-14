// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { generateDeletionCode } from './deletionCode';

describe('account deletion codes', () => {
  it('formats 100 bits of uniformly selected symbols as four readable groups', () => {
    const code = generateDeletionCode(new Uint8Array(Array.from({ length: 20 }, (_, index) => index)));
    expect(code).toMatch(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/);
    expect(code.replaceAll('-', '')).toHaveLength(20);
  });

  it('rejects insufficient entropy', () => {
    expect(() => generateDeletionCode(new Uint8Array(19))).toThrow(/20 random bytes/);
  });
});
