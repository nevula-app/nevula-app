// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Privacy-safe diagnostics. Never logs payloads, tokens, keys, or stable user IDs.
 * Production builds stay silent unless explicitly enabled for a local debug session.
 */

const SENSITIVE = /(token|password|secret|bearer|authorization|ciphertext|plaintext|private.?key|recovery|invite|session|refresh|access_token|nevula.?id|fingerprint)/i;

export type PrivacyLogCode =
  | 'session.revoke.ok'
  | 'session.revoke.partial'
  | 'session.inbox_purge.ok'
  | 'session.inbox_purge.fail'
  | 'session.directory_retract.ok'
  | 'session.directory_retract.fail'
  | 'auth.refresh.fail'
  | 'network.gate.blocked'
  | 'invite.transport.unavailable';

let debugEnabled = false;

export function setPrivacyLogDebugEnabled(enabled: boolean) {
  debugEnabled = enabled;
}

export function privacyEvent(code: PrivacyLogCode, detail?: string) {
  if (!debugEnabled) return;
  const safe = detail && !SENSITIVE.test(detail) ? detail.slice(0, 120) : undefined;
  // eslint-disable-next-line no-console -- intentional privacy-gated diagnostics only
  console.info(`[nevula:${code}]`, safe ?? '');
}

export function assertNoSensitiveString(value: string, label = 'value') {
  if (SENSITIVE.test(value)) {
    throw new Error(`Refusing to log sensitive ${label}.`);
  }
}
