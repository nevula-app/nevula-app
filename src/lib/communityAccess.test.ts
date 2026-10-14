// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), canOpenURL: vi.fn(), openURL: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  nevulaGatedFetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
}));
vi.mock('react-native', () => ({ Linking: { canOpenURL: mocks.canOpenURL, openURL: mocks.openURL } }));
import { openNevulaCommunity } from './communityAccess';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'member' }, access_token: 'test-session' } } });
  mocks.canOpenURL.mockResolvedValue(true);
});
describe('app to community entry', () => {
  it('passes proof to the verification endpoint and puts only a one-time code in the browser URL', async () => {
    const code = 'a'.repeat(64);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code }));
    vi.stubGlobal('fetch', fetchMock);
    await openNevulaCommunity();
    expect(fetchMock).toHaveBeenCalledWith('https://nevula.de/api/community/login-code', expect.objectContaining({ headers: { authorization: 'Bearer test-session', 'x-nevula-api-key': 'public-test-key' } }));
    expect(mocks.openURL).toHaveBeenCalledWith('https://nevula.de/community/connect?code=' + code);
  });
  it('does not open a browser without membership or with an invalid code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'https://evil.example' })));
    await expect(openNevulaCommunity()).rejects.toThrow('Could not create');
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(openNevulaCommunity()).rejects.toThrow('membership');
    expect(mocks.openURL).not.toHaveBeenCalled();
  });
});
