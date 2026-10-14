// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { INACTIVITY_EXPIRY_MS, isPrivateContentExpired } from './inactivityPolicy';

describe('mandatory private-content inactivity expiry', () => {
  const lastAccess = Date.UTC(2026, 0, 1);

  it('keeps local private content before 28 complete days', () => {
    expect(isPrivateContentExpired(lastAccess, lastAccess + INACTIVITY_EXPIRY_MS - 1)).toBe(false);
  });

  it('expires local private content at 28 complete days', () => {
    expect(isPrivateContentExpired(lastAccess, lastAccess + INACTIVITY_EXPIRY_MS)).toBe(true);
  });

  it('does not treat a backwards device clock as elapsed inactivity', () => {
    expect(isPrivateContentExpired(lastAccess, lastAccess - 60_000)).toBe(false);
  });
});
