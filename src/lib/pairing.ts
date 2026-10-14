// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { CRYPTO_PAIRING_ENVELOPE_VERSION } from './cryptoPolicy';

const NEVULA_ID_BODY_LENGTH = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_RE = /^[A-F0-9]{40,64}$/;
const SPKI_RE = /^[A-Za-z0-9+/_-]+=*$/;

export type PairingPayload = {
  nevulaId: string;
  fingerprint: string;
  userId: string;
  p256Spki: string;
  /** Present on invites and intros. Omitted from the camera QR so the code stays scannable. */
  kemPk?: string;
};

export function formatNevulaIdInput(value: string): string {
  let compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.startsWith('NVL')) compact = compact.slice(3);
  compact = compact.slice(0, NEVULA_ID_BODY_LENGTH);
  const groups = [compact.slice(0, 3), compact.slice(3, 6), compact.slice(6, 10)].filter(Boolean);
  return `NVL-${groups.join('-')}`;
}

export function createPairingQrPayload(payload: PairingPayload): string {
  // ML-KEM-768 public keys are ~1.6kB and make the camera QR unscannable.
  // The key travels inside the sealed intro / intro-ack, encrypted to this P-256 key.
  return `nevula://pair?v=${CRYPTO_PAIRING_ENVELOPE_VERSION}&id=${encodeURIComponent(payload.nevulaId)}&fp=${encodeURIComponent(payload.fingerprint)}&uid=${encodeURIComponent(payload.userId)}&pk=${encodeURIComponent(payload.p256Spki)}`;
}

export function parsePairingQrPayload(raw: string): PairingPayload {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('This is not a valid NEVULA pairing code.');
  }
  if (url.protocol !== 'nevula:' || url.hostname !== 'pair') {
    throw new Error('This QR code is not a supported NEVULA pairing code.');
  }
  const version = url.searchParams.get('v');
  if (version === '1' || version === '2') {
    throw new Error('This pairing code is from an older NEVULA version. Ask them to show their current pairing code.');
  }
  if (version !== String(CRYPTO_PAIRING_ENVELOPE_VERSION)) {
    throw new Error('This QR code is not a supported NEVULA pairing code.');
  }
  const nevulaId = formatNevulaIdInput(url.searchParams.get('id') ?? '');
  const fingerprint = (url.searchParams.get('fp') ?? '').replace(/\s/g, '').toUpperCase();
  const userId = (url.searchParams.get('uid') ?? '').trim().toLowerCase();
  const p256Spki = (url.searchParams.get('pk') ?? '').trim();
  if (!/^NVL-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{4}$/.test(nevulaId)) {
    throw new Error('The pairing code contains an invalid NEVULA ID.');
  }
  if (!FINGERPRINT_RE.test(fingerprint)) {
    throw new Error('The pairing code contains an invalid device fingerprint.');
  }
  if (!UUID_RE.test(userId)) {
    throw new Error('The pairing code contains an invalid device identity.');
  }
  if (!SPKI_RE.test(p256Spki) || p256Spki.length < 80) {
    throw new Error('The pairing code contains an invalid device key.');
  }
  return { nevulaId, fingerprint, userId, p256Spki };
}
