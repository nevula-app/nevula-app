// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import {
  INVITE_TOKEN_RE,
  contactInviteIntentUrl,
  contactInviteOpenUrl,
  contactInviteUrl,
  parseContactInvite,
  playInstallUrlForInvite,
} from '../../shared/contactInvite';
import {
  contactTokenHash,
  decryptInviteContact,
  encryptInviteContact,
  newContactToken,
} from './contactInviteCrypto';
import { createPairingQrPayload, parsePairingQrPayload } from './pairing';

const sample = {
  nevulaId: 'NVL-AAA-BBB-CCCC',
  fingerprint: 'AABBCCDDEEFF00112233445566778899AABBCCDD',
  userId: '11111111-2222-4333-8444-555555555555',
  p256Spki: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
};

describe('contact invite URL', () => {
  it('accepts hash and path tokens for web and app links', () => {
    const token = 'a'.repeat(64);
    expect(parseContactInvite(`https://nevula.de/invite#${token}`)).toBe(token);
    expect(parseContactInvite(`https://nevula.de/invite/${token}`)).toBe(token);
    expect(parseContactInvite(`nevula://invite#${token}`)).toBe(token);
    expect(parseContactInvite(`nevula://invite/${token}`)).toBe(token);
    expect(contactInviteUrl(token)).toBe(`https://nevula.de/invite#${token}`);
    expect(contactInviteUrl(token, true)).toBe(`nevula://invite#${token}`);
  });

  it('rejects query tokens and identity leakage patterns', () => {
    const token = 'b'.repeat(64);
    expect(parseContactInvite(`https://nevula.de/invite?token=${token}`)).toBeNull();
    expect(parseContactInvite(`https://nevula.de/invite#${token.slice(0, 63)}`)).toBeNull();
    expect(parseContactInvite(`https://evil.example/invite#${token}`)).toBeNull();
    const url = contactInviteUrl(token);
    expect(url).not.toContain(sample.userId);
    expect(url).not.toContain(sample.nevulaId);
    expect(url).not.toMatch(/@/);
  });

  it('requires 64 hex chars', () => {
    expect(INVITE_TOKEN_RE.test('g'.repeat(64))).toBe(false);
    expect(INVITE_TOKEN_RE.test('ab'.repeat(32))).toBe(true);
  });

  it('builds path-based open and intent URLs without hash fragments', () => {
    const token = 'd'.repeat(64);
    expect(contactInviteOpenUrl(token)).toBe(`nevula://invite/${token}`);
    expect(contactInviteIntentUrl(token)).toBe(
      `intent://invite/${token}#Intent;scheme=nevula;package=com.nevula.app;end`,
    );
    expect(contactInviteOpenUrl(token)).not.toContain('#');
    expect(contactInviteIntentUrl(token)).not.toContain(`invite#${token}`);
  });

  it('builds a best-effort Play referrer without putting the token in the path', () => {
    const token = 'c'.repeat(64);
    const play = playInstallUrlForInvite(token);
    expect(play.startsWith('https://play.google.com/store/apps/details?id=com.nevula.app&referrer=')).toBe(true);
    expect(play).toContain(token);
    expect(play).not.toContain(`#${token}`);
    expect(playInstallUrlForInvite(null)).toBe('https://play.google.com/store/apps/details?id=com.nevula.app');
  });
});

describe('contact invite crypto', () => {
  it('roundtrips AES-GCM envelope and rejects tampering', async () => {
    const token = newContactToken();
    const envelope = await encryptInviteContact(token, sample);
    expect(envelope.startsWith('NVI1.')).toBe(true);
    const opened = await decryptInviteContact(token, envelope);
    expect(opened).toEqual(parsePairingQrPayload(createPairingQrPayload(sample)));
    const parts = envelope.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${'00'.repeat(parts[2].length / 2)}`;
    await expect(decryptInviteContact(token, tampered)).rejects.toThrow();
    const other = newContactToken();
    await expect(decryptInviteContact(other, envelope)).rejects.toThrow();
  });

  it('hashes tokens without exposing the clear token', async () => {
    const token = 'c'.repeat(64);
    const hash = await contactTokenHash(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
  });
});
