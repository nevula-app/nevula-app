// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it } from 'vitest';
import {
  assertChatEnvelopeVersion,
  CRYPTO_CAPABILITIES,
  CRYPTO_CHAT_ENVELOPE_VERSION,
  CryptoDowngradeError,
  CryptoVersionError,
  isPairingOnlyCrypto,
  negotiateCryptoCapabilities,
} from './cryptoPolicy';

describe('cryptoPolicy', () => {
  it('accepts the current chat envelope version only', () => {
    expect(() => assertChatEnvelopeVersion(CRYPTO_CHAT_ENVELOPE_VERSION)).not.toThrow();
    expect(() => assertChatEnvelopeVersion(2)).toThrow(CryptoDowngradeError);
    expect(() => assertChatEnvelopeVersion(99)).toThrow(CryptoVersionError);
  });

  it('refuses capability downgrades and OpenPGP chat encrypt', () => {
    expect(negotiateCryptoCapabilities(CRYPTO_CAPABILITIES, { nvl3Ratchet: true, classicEcdhP256: true })).toEqual(CRYPTO_CAPABILITIES);
    expect(() => negotiateCryptoCapabilities(CRYPTO_CAPABILITIES, { nvl3Ratchet: false })).toThrow(CryptoDowngradeError);
    expect(() => negotiateCryptoCapabilities(CRYPTO_CAPABILITIES, { openPgpChatEncrypt: true })).toThrow(CryptoDowngradeError);
    expect(() => negotiateCryptoCapabilities(
      { ...CRYPTO_CAPABILITIES, pqHybrid: true },
      { ...CRYPTO_CAPABILITIES, pqHybrid: false },
    )).toThrow(CryptoDowngradeError);
  });

  it('marks NVL2 and OpenPGP as pairing/legacy-only', () => {
    expect(isPairingOnlyCrypto('nvl2')).toBe(true);
    expect(isPairingOnlyCrypto('openpgp')).toBe(true);
    expect(isPairingOnlyCrypto('nvl3')).toBe(false);
  });

  it('advertises the hybrid handshake and still refuses OpenPGP chat encrypt', () => {
    expect(CRYPTO_CAPABILITIES.pqHybrid).toBe(true);
    expect(CRYPTO_CAPABILITIES.classicEcdhP256).toBe(true);
    expect(CRYPTO_CAPABILITIES.openPgpChatEncrypt).toBe(false);
    expect(CRYPTO_CHAT_ENVELOPE_VERSION).toBe(4);
  });
});
