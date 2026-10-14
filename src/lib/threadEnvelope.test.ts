// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import {
  encodeThreadConfirm,
  encodeThreadInvite,
  encodeThreadLeave,
  tryParseThreadControl,
  unwrapThreadPlaintext,
  wrapThreadPlaintext,
} from './threadEnvelope';

describe('threadEnvelope', () => {
  it('wraps and unwraps conversation-scoped bodies', () => {
    const wrapped = wrapThreadPlaintext('nvl3:t:abc', 'hello');
    expect(wrapped.startsWith('NVL3THR.1.')).toBe(true);
    expect(unwrapThreadPlaintext(wrapped, 'nvl3:fallback')).toEqual({
      conversationId: 'nvl3:t:abc',
      body: 'hello',
    });
    expect(unwrapThreadPlaintext('plain', 'nvl3:a:b')).toEqual({
      conversationId: 'nvl3:a:b',
      body: 'plain',
    });
  });

  it('encodes invite and confirm controls', () => {
    const invite = encodeThreadInvite({
      c: 'nvl3:g:1',
      kind: 'group',
      members: ['a', 'b', 'c'],
      tor: 1,
      title: 'Ops',
      from: 'a',
    });
    expect(tryParseThreadControl(invite)).toEqual({
      k: 'thread_invite',
      c: 'nvl3:g:1',
      kind: 'group',
      members: ['a', 'b', 'c'],
      tor: 1,
      title: 'Ops',
      from: 'a',
    });
    expect(tryParseThreadControl(encodeThreadConfirm({ c: 'nvl3:g:1', from: 'b' }))).toEqual({
      k: 'thread_confirm',
      c: 'nvl3:g:1',
      ok: 1,
      from: 'b',
    });
    expect(tryParseThreadControl(encodeThreadLeave({ c: 'nvl3:t:9', from: 'a' }))).toEqual({
      k: 'thread_leave',
      c: 'nvl3:t:9',
      from: 'a',
    });
  });
});
