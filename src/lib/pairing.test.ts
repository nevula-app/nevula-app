// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import { createPairingQrPayload, parsePairingQrPayload } from './pairing';

const sample = {
  nevulaId: 'NVL-AAA-BBB-CCCC',
  fingerprint: 'A'.repeat(40),
  userId: '11111111-2222-4333-a444-555555555555',
  p256Spki: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' + 'A'.repeat(50),
};

describe('pairing QR payload', () => {
  it('roundtrips v3 with the device key, never a private key or KEM secret', () => {
    const raw = createPairingQrPayload(sample);
    expect(raw).toMatch(/^nevula:\/\/pair\?v=3&/);
    expect(raw).toContain('uid=');
    expect(raw).toContain('pk=');
    expect(raw).not.toContain('kem=');
    expect(raw).not.toMatch(/private/i);
    expect(parsePairingQrPayload(raw)).toEqual(sample);
  });

  it('rejects directory-era and pre-hybrid pairing codes', () => {
    expect(() => parsePairingQrPayload(`nevula://pair?v=1&id=${sample.nevulaId}&fp=${sample.fingerprint}`)).toThrow(/older NEVULA version/i);
    expect(() => parsePairingQrPayload(`nevula://pair?v=2&id=${sample.nevulaId}&fp=${sample.fingerprint}&uid=${sample.userId}&pk=${sample.p256Spki}`)).toThrow(/older NEVULA version/i);
  });

  it('rejects a code without a user id or public key', () => {
    expect(() => parsePairingQrPayload(`nevula://pair?v=3&id=${sample.nevulaId}&fp=${sample.fingerprint}`)).toThrow(/invalid device identity/i);
    expect(() => parsePairingQrPayload(`nevula://pair?v=3&id=${sample.nevulaId}&fp=${sample.fingerprint}&uid=${sample.userId}&pk=short`)).toThrow(/invalid device key/i);
  });
});
