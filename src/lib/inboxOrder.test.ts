// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { planInboxPass, sortInboxOldestFirst } from './inboxOrder';

describe('inbox chain order', () => {
  it('opens oldest first and leaves the rest of a chain when one message fails', () => {
    const chain = 'h8';
    const rows = [
      { id: 'invoice', expires_at: '2026-09-28T16:38:09.000Z', chainId: chain },
      { id: 'a8', expires_at: '2026-09-28T16:38:08.000Z', chainId: chain },
      { id: 'a1', expires_at: '2026-09-28T16:38:01.000Z', chainId: chain },
      { id: 'other', expires_at: '2026-09-28T16:38:04.000Z', chainId: 'samsung' },
    ];
    const pass = planInboxPass(rows, id => id !== 'a8');
    expect(pass.tried).toEqual(['a1', 'other', 'a8']);
    expect(pass.left).toEqual(['invoice']);
  });

  it('opens eight announcements and the invoice when every blob opens', () => {
    const chain = 'h8';
    const rows = [];
    for (let n = 8; n >= 1; n -= 1) {
      rows.push({ id: `a${n}`, expires_at: `2026-09-28T16:38:0${n}.000Z`, chainId: chain });
    }
    rows.push({ id: 'tag3', expires_at: '2026-09-28T16:38:09.000Z', chainId: chain });
    const pass = planInboxPass(rows, () => true);
    expect(pass.tried).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'tag3']);
    expect(pass.left).toEqual([]);
  });

  it('sorts by expiry and does not prefer the newest blob', () => {
    const sorted = sortInboxOldestFirst([
      { id: 'new', expires_at: '2026-09-28T16:38:09.000Z' },
      { id: 'old', expires_at: '2026-09-28T16:38:01.000Z' },
    ]);
    expect(sorted.map(row => row.id)).toEqual(['old', 'new']);
  });
});
