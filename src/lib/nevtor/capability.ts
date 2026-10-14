// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * E2EE peer capability: only "NevTOR currently active for me".
 * No IPs, circuits, routes, or network details — Boolean only.
 * Carried as a sealed NVL3 chat blob (same contact channel as messages).
 */

export const NEVTOR_CAP_PREFIX = 'NVLCAP.1.';
/** Per-chat preference: "I require NevTOR for this chat". */
export const NEVTOR_REQ_PREFIX = 'NVLREQ.1.';

export type PeerNevTorCapability = {
  active: boolean;
  updatedAt: string;
};

export type PeerChatNevTorRequire = {
  required: boolean;
  updatedAt: string;
  /** Conversation this decision applies to (multi-chat / groups). */
  conversationId?: string;
};

export function encodeNevTorCapability(active: boolean, updatedAt = new Date().toISOString()): string {
  const payload = JSON.stringify({
    k: 'nevtor',
    a: active ? 1 : 0,
    t: updatedAt,
  });
  return `${NEVTOR_CAP_PREFIX}${payload}`;
}

export function tryParseNevTorCapability(plaintext: string): PeerNevTorCapability | null {
  if (!plaintext.startsWith(NEVTOR_CAP_PREFIX)) return null;
  try {
    const raw = plaintext.slice(NEVTOR_CAP_PREFIX.length);
    const parsed = JSON.parse(raw) as { k?: string; a?: number; t?: string };
    if (parsed?.k !== 'nevtor') return null;
    if (parsed.a !== 0 && parsed.a !== 1) return null;
    if (typeof parsed.t !== 'string' || !parsed.t) return null;
    return { active: parsed.a === 1, updatedAt: parsed.t };
  } catch {
    return null;
  }
}

export function encodeChatNevTorRequire(
  required: boolean,
  updatedAt = new Date().toISOString(),
  conversationId?: string,
): string {
  const payload = JSON.stringify({
    k: 'nevtor_req',
    r: required ? 1 : 0,
    t: updatedAt,
    ...(conversationId ? { c: conversationId } : {}),
  });
  return `${NEVTOR_REQ_PREFIX}${payload}`;
}

export function tryParseChatNevTorRequire(plaintext: string): PeerChatNevTorRequire | null {
  if (!plaintext.startsWith(NEVTOR_REQ_PREFIX)) return null;
  try {
    const raw = plaintext.slice(NEVTOR_REQ_PREFIX.length);
    const parsed = JSON.parse(raw) as { k?: string; r?: number; t?: string; c?: string };
    if (parsed?.k !== 'nevtor_req') return null;
    if (parsed.r !== 0 && parsed.r !== 1) return null;
    if (typeof parsed.t !== 'string' || !parsed.t) return null;
    return {
      required: parsed.r === 1,
      updatedAt: parsed.t,
      conversationId: typeof parsed.c === 'string' && parsed.c.startsWith('nvl3:') ? parsed.c : undefined,
    };
  } catch {
    return null;
  }
}

export function isNevTorCapabilityPlaintext(plaintext: string) {
  return plaintext.startsWith(NEVTOR_CAP_PREFIX) || plaintext.startsWith(NEVTOR_REQ_PREFIX);
}
