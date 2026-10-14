// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Conversation-scoped chat envelopes carried inside sealed NVL3 plaintext.
 * Untagged bodies belong to the default 1:1 conversation for that peer.
 */

export const THREAD_MSG_PREFIX = 'NVL3THR.1.';
export const THREAD_CTRL_PREFIX = 'NVL3TCTL.1.';

/** Key material the inviter already holds — peers confirm before trusting. */
export type ThreadMemberIntro = {
  id: string;
  n: string;
  d?: string | null;
  k?: string;
  f?: string;
  /** ML-KEM-768 public key. */
  q?: string;
};

export type ThreadInvitePayload = {
  k: 'thread_invite';
  c: string;
  kind: 'dm' | 'group';
  members: string[];
  tor: 0 | 1;
  title: string | null;
  from: string;
  /** Optional intros so existing members can confirm newcomers (and vice versa). */
  intros?: ThreadMemberIntro[];
};

export type ThreadConfirmPayload = {
  k: 'thread_confirm';
  c: string;
  ok: 1;
  from: string;
};

/** Peer left / deleted this conversation — hide on both sides. */
export type ThreadLeavePayload = {
  k: 'thread_leave';
  c: string;
  from: string;
};

export type ThreadControl = ThreadInvitePayload | ThreadConfirmPayload | ThreadLeavePayload;

export function wrapThreadPlaintext(conversationId: string, body: string): string {
  if (!conversationId || body.startsWith(THREAD_MSG_PREFIX) || body.startsWith(THREAD_CTRL_PREFIX)) {
    return body;
  }
  return `${THREAD_MSG_PREFIX}${conversationId}\n${body}`;
}

export function unwrapThreadPlaintext(
  plaintext: string,
  fallbackConversationId: string,
): { conversationId: string; body: string } {
  if (!plaintext.startsWith(THREAD_MSG_PREFIX)) {
    return { conversationId: fallbackConversationId, body: plaintext };
  }
  const rest = plaintext.slice(THREAD_MSG_PREFIX.length);
  const nl = rest.indexOf('\n');
  if (nl <= 0) return { conversationId: fallbackConversationId, body: plaintext };
  const conversationId = rest.slice(0, nl).trim();
  const body = rest.slice(nl + 1);
  if (!conversationId.startsWith('nvl3:')) {
    return { conversationId: fallbackConversationId, body: plaintext };
  }
  return { conversationId, body };
}

export function encodeThreadInvite(payload: Omit<ThreadInvitePayload, 'k'>): string {
  return `${THREAD_CTRL_PREFIX}${JSON.stringify({ k: 'thread_invite', ...payload })}`;
}

export function encodeThreadConfirm(payload: Omit<ThreadConfirmPayload, 'k' | 'ok'>): string {
  return `${THREAD_CTRL_PREFIX}${JSON.stringify({ k: 'thread_confirm', ok: 1, ...payload })}`;
}

export function encodeThreadLeave(payload: Omit<ThreadLeavePayload, 'k'>): string {
  return `${THREAD_CTRL_PREFIX}${JSON.stringify({ k: 'thread_leave', ...payload })}`;
}

export function tryParseThreadControl(plaintext: string): ThreadControl | null {
  if (!plaintext.startsWith(THREAD_CTRL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(plaintext.slice(THREAD_CTRL_PREFIX.length)) as ThreadControl;
    if (parsed?.k === 'thread_invite') {
      if (typeof parsed.c !== 'string' || !parsed.c.startsWith('nvl3:')) return null;
      if (parsed.kind !== 'dm' && parsed.kind !== 'group') return null;
      if (!Array.isArray(parsed.members)) return null;
      if (parsed.tor !== 0 && parsed.tor !== 1) return null;
      if (typeof parsed.from !== 'string') return null;
      const introsRaw = Array.isArray((parsed as ThreadInvitePayload).intros)
        ? (parsed as ThreadInvitePayload).intros!
        : [];
      const intros = introsRaw
        .filter((row): row is ThreadMemberIntro => Boolean(row && typeof row.id === 'string' && typeof row.n === 'string'))
        .map(row => ({
          id: row.id,
          n: row.n,
          d: typeof row.d === 'string' ? row.d : null,
          k: typeof row.k === 'string' ? row.k : undefined,
          f: typeof row.f === 'string' ? row.f : undefined,
          q: typeof row.q === 'string' ? row.q : undefined,
        }));
      return {
        k: 'thread_invite',
        c: parsed.c,
        kind: parsed.kind,
        members: parsed.members.filter((m): m is string => typeof m === 'string'),
        tor: parsed.tor,
        title: typeof parsed.title === 'string' ? parsed.title : null,
        from: parsed.from,
        ...(intros.length ? { intros } : {}),
      };
    }
    if (parsed?.k === 'thread_confirm') {
      if (typeof parsed.c !== 'string' || !parsed.c.startsWith('nvl3:')) return null;
      if (parsed.ok !== 1) return null;
      if (typeof parsed.from !== 'string') return null;
      return { k: 'thread_confirm', c: parsed.c, ok: 1, from: parsed.from };
    }
    if (parsed?.k === 'thread_leave') {
      if (typeof parsed.c !== 'string' || !parsed.c.startsWith('nvl3:')) return null;
      if (typeof parsed.from !== 'string') return null;
      return { k: 'thread_leave', c: parsed.c, from: parsed.from };
    }
    return null;
  } catch {
    return null;
  }
}

export function isThreadControlPlaintext(plaintext: string) {
  return plaintext.startsWith(THREAD_CTRL_PREFIX);
}
