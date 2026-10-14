// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Crypto version / capability negotiation.
 * Fail closed on unknown or downgraded chat envelopes.
 * Chat sessions are P-256 ECDH mixed with ML-KEM-768. There is no classical fallback.
 */

export const CRYPTO_CHAT_ENVELOPE_VERSION = 4 as const;
export const CRYPTO_PAIRING_ENVELOPE_VERSION = 3 as const;

export type CryptoCapabilities = {
  nvl3Ratchet: boolean;
  classicEcdhP256: boolean;
  pqHybrid: boolean;
  openPgpChatEncrypt: boolean;
};

/** Local protocol capabilities advertised for future negotiation. */
export const CRYPTO_CAPABILITIES: CryptoCapabilities = {
  nvl3Ratchet: true,
  classicEcdhP256: true,
  /** P-256 ECDH mixed with ML-KEM-768 inside the NVL4 session key. */
  pqHybrid: true,
  openPgpChatEncrypt: false,
};

export class CryptoDowngradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoDowngradeError';
  }
}

export class CryptoVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoVersionError';
  }
}

/** Chat wire envelopes must be exactly the supported NVL3 version. */
export function assertChatEnvelopeVersion(version: unknown): asserts version is typeof CRYPTO_CHAT_ENVELOPE_VERSION {
  if (version === CRYPTO_CHAT_ENVELOPE_VERSION) return;
  if (typeof version === 'number' && version > CRYPTO_CHAT_ENVELOPE_VERSION) {
    throw new CryptoVersionError('This message uses a newer encryption format. Update NEVULA to open it.');
  }
  if (typeof version === 'number' && version < CRYPTO_CHAT_ENVELOPE_VERSION) {
    throw new CryptoDowngradeError('Refusing an older chat encryption format.');
  }
  throw new CryptoVersionError('Unknown message format.');
}

/**
 * When both peers advertise capabilities, never silently drop to a weaker set.
 * This build requires the hybrid handshake. A peer that turns it off is refused.
 */
export function negotiateCryptoCapabilities(
  local: CryptoCapabilities,
  remote: Partial<CryptoCapabilities> | null | undefined,
): CryptoCapabilities {
  if (!remote) return local;
  if (remote.pqHybrid === true && !local.pqHybrid) {
    throw new CryptoDowngradeError('Peer requires post-quantum hybrid crypto that this build does not support.');
  }
  if (local.pqHybrid && remote.pqHybrid === false) {
    throw new CryptoDowngradeError('Refusing to downgrade away from post-quantum hybrid crypto.');
  }
  if (remote.nvl3Ratchet === false || remote.classicEcdhP256 === false) {
    throw new CryptoDowngradeError('Peer disabled required chat crypto capabilities.');
  }
  if (remote.openPgpChatEncrypt === true) {
    throw new CryptoDowngradeError('OpenPGP chat encryption is not allowed.');
  }
  return local;
}

export function isPairingOnlyCrypto(label: 'nvl2' | 'openpgp' | 'nvl3'): boolean {
  return label === 'nvl2' || label === 'openpgp';
}
