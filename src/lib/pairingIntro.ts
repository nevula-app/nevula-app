// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export const PAIRING_INTRO_PREFIX = 'NVL-INTRO:';
export const PAIRING_INTRO_MS = 7 * 24 * 60 * 60 * 1000;

export type PairingTrust = 'in_person' | 'key';

export type PairingIntro = {
  v: 1;
  kind: 'intro' | 'intro-ack' | 'intro-decline';
  userId: string;
  nevulaId: string;
  displayName: string | null;
  source?: 'public_invite';
  /** Set when the sender already verified the peer (QR scan / pairing link). One-sided trust. */
  trust?: PairingTrust;
  /** Sender ML-KEM-768 public key. Required before a hybrid chat can start. */
  kem?: string;
  /** Sent with a chat open after the other phone may have deleted the contact. */
  rechat?: true;
  conversationId?: string;
  tor?: boolean;
};

export function packPairingIntro(intro: PairingIntro): string {
  return `${PAIRING_INTRO_PREFIX}${JSON.stringify({
    v: 1,
    kind: intro.kind,
    userId: intro.userId,
    nevulaId: intro.nevulaId,
    displayName: intro.displayName ?? null,
    ...(intro.source === 'public_invite' ? { source: intro.source } : {}),
    ...(intro.trust === 'in_person' || intro.trust === 'key' ? { trust: intro.trust } : {}),
    ...(intro.kem ? { kem: intro.kem } : {}),
    ...(intro.rechat ? { rechat: true as const } : {}),
    ...(intro.conversationId ? { conversationId: intro.conversationId } : {}),
    ...(intro.tor ? { tor: true } : {}),
  } satisfies PairingIntro)}`;
}

export function parsePairingIntro(plaintext: string): PairingIntro | null {
  if (typeof plaintext !== 'string' || !plaintext.startsWith(PAIRING_INTRO_PREFIX)) return null;
  try {
    const parsed = JSON.parse(plaintext.slice(PAIRING_INTRO_PREFIX.length)) as Partial<PairingIntro>;
    if (parsed?.v !== 1) return null;
    if (parsed.kind !== 'intro' && parsed.kind !== 'intro-ack' && parsed.kind !== 'intro-decline') return null;
    if (!parsed.userId || !parsed.nevulaId) return null;
    const trust = parsed.trust === 'in_person' || parsed.trust === 'key' ? parsed.trust : undefined;
    const kem = typeof parsed.kem === 'string' && parsed.kem.length > 0 ? parsed.kem : undefined;
    const conversationId = typeof parsed.conversationId === 'string' && parsed.conversationId.length > 0
      ? parsed.conversationId
      : undefined;
    return {
      v: 1,
      kind: parsed.kind,
      userId: parsed.userId,
      nevulaId: parsed.nevulaId,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      ...(parsed.source === 'public_invite' ? { source: parsed.source } : {}),
      ...(trust ? { trust } : {}),
      ...(kem ? { kem } : {}),
      ...(parsed.rechat === true && conversationId ? { rechat: true as const, conversationId, tor: parsed.tor === true } : {}),
    };
  } catch {
    return null;
  }
}
