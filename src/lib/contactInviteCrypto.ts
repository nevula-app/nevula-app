// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { INVITE_TOKEN_RE } from '../../shared/contactInvite';
import { createPairingQrPayload, parsePairingQrPayload, type PairingPayload } from './pairing';

const encode = (value: string) => new TextEncoder().encode(value);
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
function unhex(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/.test(value)) throw new Error('Invalid invitation envelope.');
  return Uint8Array.from(value.match(/../g)!, b => parseInt(b, 16));
}
function requireToken(token: string) {
  if (!INVITE_TOKEN_RE.test(token)) throw new Error('Invalid contact invitation.');
}
export function newContactToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
export async function contactTokenHash(token: string) {
  requireToken(token);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(`NEVULA-invite-lookup-v1:${token}`))));
}
async function envelopeKey(token: string) {
  requireToken(token);
  const key = await crypto.subtle.digest('SHA-256', encode(`NEVULA-invite-envelope-v1:${token}`));
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptInviteContact(token: string, contact: PairingPayload) {
  // Serialize only the existing PUBLIC handshake fields, never an identity object wholesale.
  const payload = createPairingQrPayload(contact);
  parsePairingQrPayload(payload);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode('NEVULA-invite-v1') }, await envelopeKey(token), encode(payload));
  return `NVI1.${hex(iv)}.${hex(new Uint8Array(ct))}`;
}
export async function decryptInviteContact(token: string, envelope: string) {
  if (typeof envelope !== 'string' || envelope.length > 8192) throw new Error('Invalid invitation envelope.');
  const [version, iv, ct, extra] = envelope.split('.');
  if (version !== 'NVI1' || !iv || iv.length !== 24 || !ct || extra !== undefined) throw new Error('Invalid invitation envelope.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(iv), additionalData: encode('NEVULA-invite-v1') }, await envelopeKey(token), unhex(ct));
  return parsePairingQrPayload(new TextDecoder().decode(plain));
}
