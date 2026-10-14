// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { packPairingIntro, parsePairingIntro } from './pairingIntro';

describe('sealed pairing intro', () => {
  it('roundtrips an intro without putting sender fields in the clear', () => {
    const packed = packPairingIntro({
      v: 1,
      kind: 'intro',
      userId: 'alice',
      nevulaId: 'NVL-AAA-BBB-CCCC',
      displayName: null,
    });
    expect(packed.startsWith('NVL-INTRO:')).toBe(true);
    expect(parsePairingIntro(packed)).toEqual({
      v: 1,
      kind: 'intro',
      userId: 'alice',
      nevulaId: 'NVL-AAA-BBB-CCCC',
      displayName: null,
    });
  });

  it('rejects chat plaintext and unknown envelopes', () => {
    expect(parsePairingIntro('hello')).toBeNull();
    expect(parsePairingIntro('NVL-INTRO:{"v":2,"kind":"intro"}')).toBeNull();
    expect(parsePairingIntro(packPairingIntro({
      v: 1,
      kind: 'intro-ack',
      userId: 'bob',
      nevulaId: 'NVL-111-222-3333',
      displayName: 'B',
    }))).toMatchObject({ kind: 'intro-ack', userId: 'bob' });
  });

  it('roundtrips trust so one-sided Accept can show Trusted on both phones', () => {
    const packed = packPairingIntro({
      v: 1,
      kind: 'intro',
      userId: 'alice',
      nevulaId: 'NVL-AAA-BBB-CCCC',
      displayName: null,
      trust: 'in_person',
    });
    expect(parsePairingIntro(packed)).toMatchObject({ trust: 'in_person' });
  });

  it('roundtrips a rechat intro that reopens a deleted contact chat', () => {
    const packed = packPairingIntro({
      v: 1,
      kind: 'intro',
      userId: 'alice',
      nevulaId: 'NVL-AAA-BBB-CCCC',
      displayName: null,
      rechat: true,
      conversationId: 'thread-1',
      tor: true,
    });
    expect(parsePairingIntro(packed)).toMatchObject({
      rechat: true,
      conversationId: 'thread-1',
      tor: true,
    });
  });
});
