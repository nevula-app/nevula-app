// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { contactInviteTransport } from './contactInviteTransport';

describe('contactInviteTransport', () => {
  it('maps missing RPC to a clear unavailable message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await expect(contactInviteTransport.call('resolve_contact_invite', { p_hash: 'a'.repeat(64) })).rejects.toThrow(
      /not available on this server/,
    );
  });

  it('maps rate limit and unavailable exceptions', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invite_rate_limit' } });
    await expect(contactInviteTransport.call('submit_contact_invite', {})).rejects.toThrow(/Too many attempts/);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'invite_unavailable' } });
    await expect(contactInviteTransport.call('resolve_contact_invite', {})).rejects.toThrow(/expired, was revoked/);
  });

  it('returns RPC data on success', async () => {
    rpc.mockResolvedValueOnce({ data: 'NVI1.abc', error: null });
    await expect(contactInviteTransport.call('resolve_contact_invite', { p_hash: 'f'.repeat(64) })).resolves.toBe('NVI1.abc');
  });
});
