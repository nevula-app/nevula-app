// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260830133448_account_deletion.sql'),
  'utf8',
);
const edgeFunction = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'delete-account', 'index.ts'),
  'utf8',
);

describe('anonymous account deletion backend', () => {
  it('stores only a digest in an RLS table unavailable to app roles', () => {
    expect(migration).toMatch(/code_digest text NOT NULL/);
    expect(migration).not.toMatch(/deletion_code text/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.account_deletion_credentials FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/ON DELETE CASCADE/);
  });

  it('keeps privileged deletion server-side and verifies external codes', () => {
    expect(edgeFunction).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(edgeFunction).toMatch(/ACCOUNT_DELETION_PEPPER/);
    expect(edgeFunction).toMatch(/auth\.admin\.deleteUser/);
    expect(edgeFunction).toMatch(/constantTimeEqual/);
    expect(edgeFunction).toMatch(/account_deletion_attempts/);
    expect(edgeFunction).toMatch(/DELETE_ACCOUNT_ALLOWED_ORIGIN/);
  });
});
