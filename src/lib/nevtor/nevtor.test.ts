// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { store.set(key, value); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

import { encodeNevTorCapability, tryParseNevTorCapability, encodeChatNevTorRequire, tryParseChatNevTorRequire, isNevTorCapabilityPlaintext } from './capability';
import { chatRequiresNevTor, hasMyChatNevTorDecision, setMyChatNevTorRequire } from './chatRequire';
import { NevTorManager } from './manager';
import type { PrivacyTransport } from './types';

describe('nevtor capability', () => {
  beforeEach(() => store.clear());
  it('encodes and parses active flag only', () => {
    const text = encodeNevTorCapability(true, '2026-09-18T10:00:00.000Z');
    expect(text.startsWith('NVLCAP.1.')).toBe(true);
    expect(isNevTorCapabilityPlaintext(text)).toBe(true);
    expect(tryParseNevTorCapability(text)).toEqual({
      active: true,
      updatedAt: '2026-09-18T10:00:00.000Z',
    });
    expect(tryParseNevTorCapability(encodeNevTorCapability(false, '2026-09-18T11:00:00.000Z'))).toEqual({
      active: false,
      updatedAt: '2026-09-18T11:00:00.000Z',
    });
  });

  it('encodes and parses chat require flag', () => {
    const text = encodeChatNevTorRequire(true, '2026-09-19T10:00:00.000Z');
    expect(text.startsWith('NVLREQ.1.')).toBe(true);
    expect(isNevTorCapabilityPlaintext(text)).toBe(true);
    expect(tryParseChatNevTorRequire(text)).toEqual({
      required: true,
      updatedAt: '2026-09-19T10:00:00.000Z',
    });
    expect(tryParseChatNevTorRequire(encodeChatNevTorRequire(false, '2026-09-19T11:00:00.000Z'))).toEqual({
      required: false,
      updatedAt: '2026-09-19T11:00:00.000Z',
    });
    expect(tryParseChatNevTorRequire(encodeChatNevTorRequire(true, '2026-09-19T12:00:00.000Z', 'nvl3:t:abc'))).toEqual({
      required: true,
      updatedAt: '2026-09-19T12:00:00.000Z',
      conversationId: 'nvl3:t:abc',
    });
  });

  it('ORs either side requiring NevTOR for a chat', () => {
    expect(chatRequiresNevTor(false, false)).toBe(false);
    expect(chatRequiresNevTor(true, false)).toBe(true);
    expect(chatRequiresNevTor(false, true)).toBe(true);
    expect(chatRequiresNevTor(true, true)).toBe(true);
  });

  it('records one-time Orbot decision per conversation key', async () => {
    expect(await hasMyChatNevTorDecision('me', 'peer-a')).toBe(false);
    await setMyChatNevTorRequire('me', 'peer-a', false);
    expect(await hasMyChatNevTorDecision('me', 'peer-a')).toBe(true);
    expect(await hasMyChatNevTorDecision('me', 'peer-b')).toBe(false);
    await setMyChatNevTorRequire('me', 'peer-b', true);
    expect(await hasMyChatNevTorDecision('me', 'peer-b')).toBe(true);
    await setMyChatNevTorRequire('me', 'peer-b', false);
    const { getMyChatNevTorRequire } = await import('./chatRequire');
    expect(await getMyChatNevTorRequire('me', 'peer-b')).toBe(true);
  });
});

describe('NevTorManager fail-closed', () => {
  it('allows outbound when disabled', async () => {
    const manager = new NevTorManager();
    expect(manager.isOutboundAllowed()).toBe(true);
  });

  it('blocks outbound in TOR_ONLY when probe fails', async () => {
    const manager = new NevTorManager();
    (manager as any).publish({
      routingMode: 'TOR_ONLY',
      allowDirectFallback: true,
      connection: 'unavailable',
      torReady: false,
      usingDirectFallback: false,
      lastError: 'not tor',
      probeDetail: 'not tor',
    });
    expect(manager.isOutboundAllowed()).toBe(false);
  });

  it('allows clearnet fallback in TOR_PREFERRED when allowDirectFallback', async () => {
    const manager = new NevTorManager();
    (manager as any).publish({
      routingMode: 'TOR_PREFERRED',
      allowDirectFallback: true,
      connection: 'unavailable',
      torReady: false,
      usingDirectFallback: true,
      lastError: 'not tor',
      probeDetail: 'not tor',
    });
    expect(manager.isOutboundAllowed()).toBe(true);
    expect(manager.getSnapshot().torReady).toBe(false);
    expect(manager.getSnapshot().usingDirectFallback).toBe(true);
  });

  it('blocks TOR_PREFERRED when direct fallback is disabled', async () => {
    const manager = new NevTorManager();
    (manager as any).publish({
      routingMode: 'TOR_PREFERRED',
      allowDirectFallback: false,
      connection: 'unavailable',
      torReady: false,
      usingDirectFallback: false,
      lastError: 'not tor',
      probeDetail: 'not tor',
    });
    expect(manager.isOutboundAllowed()).toBe(false);
  });

  it('allows inbox receive while Tor probe is not ready', async () => {
    const manager = new NevTorManager();
    (manager as any).publish({
      routingMode: 'TOR_PREFERRED',
      allowDirectFallback: false,
      connection: 'unavailable',
      torReady: false,
      usingDirectFallback: false,
      lastError: 'not tor',
      probeDetail: 'not tor',
    });
    expect(manager.isOutboundAllowed()).toBe(false);
    const allowed = await manager.withInboxReceiveAllowed(async () => manager.isOutboundAllowed());
    expect(allowed).toBe(true);
    expect(manager.isOutboundAllowed()).toBe(false);
  });

  it('never reports connected from mode alone', async () => {
    const manager = new NevTorManager();
    const slow: PrivacyTransport = {
      kind: 'tor',
      start: async () => {},
      stop: async () => {},
      probe: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { ready: true, detail: 'later' };
      },
    };
    manager.setTransports({ tor: slow });
    (manager as any).publish({
      routingMode: 'TOR_PREFERRED',
      allowDirectFallback: true,
      connection: 'connecting',
      torReady: false,
      usingDirectFallback: false,
      lastError: null,
      probeDetail: null,
    });
    expect(manager.getSnapshot().torReady).toBe(false);
    expect(manager.getSnapshot().connection).toBe('connecting');
  });
});
