// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260918075408_public_contact_invites.sql'),
  'utf8',
);
/** SQL body without `--` comments so checklist prose cannot false-trigger. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('public contact invite migration (static)', () => {
  it('keeps invite tables private and only grants authenticated RPC wrappers', () => {
    expect(sql).toMatch(/create schema if not exists invite_private/);
    expect(sql).toMatch(/revoke all on schema invite_private from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on all tables in schema invite_private from public, anon, authenticated/);
    expect(sql).toMatch(/public\.resolve_contact_invite\(text\)/);
    expect(sql).toMatch(/to authenticated/);
    expect(sql).not.toMatch(/to anon/);
    expect(sql).toMatch(/grant execute on function public\.rotate_contact_invite/);
  });

  it('enqueues into message_blobs for the link owner only', () => {
    expect(sql).toMatch(/insert into public\.message_blobs\(id, recipient_id, ciphertext, expires_at\)/);
    expect(sql).toMatch(/values\(p_id, link\.owner_id, p_ciphertext, now\(\) \+ interval '7 days'\)/);
    expect(sql).toMatch(/p_ciphertext not like 'NVL2\.%'/);
  });

  it('requires auth and rate-limits sensitive operations', () => {
    expect(sql).toMatch(/if me is null then raise exception 'invite_auth_required'/);
    expect(sql).toMatch(/invite_rate_limit/);
    expect(sql).toMatch(/invite_unavailable/);
    expect(sql).toMatch(/for update/);
  });

  it('never stores a plaintext token column', () => {
    expect(sql).toMatch(/token_hash text not null unique/);
    expect(sql).not.toMatch(/\btoken text\b/);
  });
});
