// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it, vi } from 'vitest';
import {
  planLegacyGraphRetract,
  runLegacyGraphRetract,
  type LegacyGraphIo,
  type LegacyMessageRow,
} from './legacyGraphRetract';

const row = (id: string): LegacyMessageRow => ({
  id,
  conversation_id: 'conv-1',
  sender_id: 'peer',
  ciphertext: `cipher-${id}`,
  created_at: '2026-08-30T00:00:00.000Z',
  expires_at: '2026-09-27T00:00:00.000Z',
});

function io(partial: Partial<LegacyGraphIo> & Pick<LegacyGraphIo, 'hasImported' | 'pullReadable'>): LegacyGraphIo & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    hasImported: async userId => {
      calls.push('hasImported');
      return partial.hasImported(userId);
    },
    pullReadable: async userId => {
      calls.push('pullReadable');
      return partial.pullReadable(userId);
    },
    persistRows: async (userId, rows) => {
      calls.push('persistRows');
      return partial.persistRows ? partial.persistRows(userId, rows) : rows.length;
    },
    deleteOwnMemberships: async userId => {
      calls.push('deleteOwnMemberships');
      await partial.deleteOwnMemberships?.(userId);
    },
    deleteOwnContactRequests: async userId => {
      calls.push('deleteOwnContactRequests');
      await partial.deleteOwnContactRequests?.(userId);
    },
  };
}

describe('planLegacyGraphRetract', () => {
  it('holds until the one-shot import flag is set', () => {
    expect(planLegacyGraphRetract({
      imported: false,
      pullSucceeded: true,
      readableCount: 0,
      storedCount: 0,
    })).toEqual({ action: 'hold', reason: 'not_imported' });
  });

  it('holds when the membership-gated pull fails, even if something is already local', () => {
    expect(planLegacyGraphRetract({
      imported: true,
      pullSucceeded: false,
      readableCount: 2,
      storedCount: 2,
    })).toEqual({ action: 'hold', reason: 'pull_failed' });
  });

  it('holds when readable leftover ciphertext is not yet on-device', () => {
    expect(planLegacyGraphRetract({
      imported: true,
      pullSucceeded: true,
      readableCount: 3,
      storedCount: 2,
    })).toEqual({ action: 'hold', reason: 'unread_not_local' });
  });

  it('drops membership after a successful pull of zero leftover rows', () => {
    expect(planLegacyGraphRetract({
      imported: true,
      pullSucceeded: true,
      readableCount: 0,
      storedCount: 0,
    })).toEqual({ action: 'drop_membership' });
  });

  it('drops membership only after every readable row is stored', () => {
    expect(planLegacyGraphRetract({
      imported: true,
      pullSucceeded: true,
      readableCount: 4,
      storedCount: 4,
    })).toEqual({ action: 'drop_membership' });
  });
});

describe('runLegacyGraphRetract sequencing', () => {
  it('does not pull or delete when import has not run', async () => {
    const fake = io({
      hasImported: async () => false,
      pullReadable: async () => ({ ok: true, rows: [row('a')] }),
    });
    const result = await runLegacyGraphRetract('me', fake);
    expect(result.plan).toEqual({ action: 'hold', reason: 'not_imported' });
    expect(result.droppedMembership).toBe(false);
    expect(fake.calls).toEqual(['hasImported']);
  });

  it('pulls then persists before any DELETE, and skips DELETE if persist is short', async () => {
    const fake = io({
      hasImported: async () => true,
      pullReadable: async () => ({ ok: true, rows: [row('a'), row('b')] }),
      persistRows: async () => 1,
    });
    const result = await runLegacyGraphRetract('me', fake);
    expect(result.plan).toEqual({ action: 'hold', reason: 'unread_not_local' });
    expect(result.droppedMembership).toBe(false);
    expect(fake.calls).toEqual(['hasImported', 'pullReadable', 'persistRows']);
  });

  it('does not DELETE membership after a failed pull', async () => {
    const fake = io({
      hasImported: async () => true,
      pullReadable: async () => ({ ok: false, rows: [] }),
      persistRows: async () => {
        throw new Error('must not persist after a failed pull');
      },
    });
    const result = await runLegacyGraphRetract('me', fake);
    expect(result.plan).toEqual({ action: 'hold', reason: 'pull_failed' });
    expect(result.droppedMembership).toBe(false);
    expect(fake.calls).toEqual(['hasImported', 'pullReadable']);
  });

  it('after a complete local store, DELETEs own conversation_members and then contact_requests', async () => {
    const deleteMembers = vi.fn(async () => undefined);
    const deletePairing = vi.fn(async () => undefined);
    const fake = io({
      hasImported: async () => true,
      pullReadable: async () => ({ ok: true, rows: [row('a'), row('b')] }),
      persistRows: async (_userId, rows) => rows.length,
      deleteOwnMemberships: deleteMembers,
      deleteOwnContactRequests: deletePairing,
    });
    const result = await runLegacyGraphRetract('me', fake);
    expect(result).toMatchObject({
      plan: { action: 'drop_membership' },
      droppedMembership: true,
      droppedPairing: true,
      storedCount: 2,
      readableCount: 2,
    });
    expect(fake.calls).toEqual([
      'hasImported',
      'pullReadable',
      'persistRows',
      'deleteOwnMemberships',
      'deleteOwnContactRequests',
    ]);
    expect(deleteMembers).toHaveBeenCalledWith('me');
    expect(deletePairing).toHaveBeenCalledWith('me');
    expect(deleteMembers.mock.invocationCallOrder[0]).toBeLessThan(deletePairing.mock.invocationCallOrder[0]!);
  });

  it('treats an already-imported empty leftover graph as retractable', async () => {
    const fake = io({
      hasImported: async () => true,
      pullReadable: async () => ({ ok: true, rows: [] }),
    });
    const result = await runLegacyGraphRetract('me', fake);
    expect(result.droppedMembership).toBe(true);
    expect(result.droppedPairing).toBe(true);
    expect(fake.calls).toEqual([
      'hasImported',
      'pullReadable',
      'persistRows',
      'deleteOwnMemberships',
      'deleteOwnContactRequests',
    ]);
  });
});
