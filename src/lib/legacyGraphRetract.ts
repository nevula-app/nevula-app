// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export const LEGACY_GRAPH_IMPORTED_KEY_PREFIX = 'nevula.legacy.graph.imported';

export function legacyGraphImportedKey(userId: string) {
  return `${LEGACY_GRAPH_IMPORTED_KEY_PREFIX}.${userId}`;
}

export type LegacyRetractState = {
  imported: boolean;
  pullSucceeded: boolean;
  readableCount: number;
  storedCount: number;
};

export type LegacyRetractPlan =
  | { action: 'hold'; reason: 'not_imported' | 'pull_failed' | 'unread_not_local' }
  | { action: 'drop_membership' };

/** encrypted_messages SELECT requires membership. Never drop it while unread ciphertext is still only on the server. */
export function planLegacyGraphRetract(state: LegacyRetractState): LegacyRetractPlan {
  if (!state.imported) return { action: 'hold', reason: 'not_imported' };
  if (!state.pullSucceeded) return { action: 'hold', reason: 'pull_failed' };
  if (state.storedCount < state.readableCount) return { action: 'hold', reason: 'unread_not_local' };
  return { action: 'drop_membership' };
}

export type LegacyMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  ciphertext: string;
  created_at: string;
  expires_at: string | null;
};

export type LegacyGraphIo = {
  hasImported: (userId: string) => Promise<boolean>;
  pullReadable: (userId: string) => Promise<{ ok: boolean; rows: LegacyMessageRow[] }>;
  persistRows: (userId: string, rows: LegacyMessageRow[]) => Promise<number>;
  deleteOwnMemberships: (userId: string) => Promise<void>;
  deleteOwnContactRequests: (userId: string) => Promise<void>;
};

export type LegacyRetractResult = {
  plan: LegacyRetractPlan;
  droppedMembership: boolean;
  droppedPairing: boolean;
  storedCount: number;
  readableCount: number;
};

export async function runLegacyGraphRetract(userId: string, io: LegacyGraphIo): Promise<LegacyRetractResult> {
  const imported = await io.hasImported(userId);
  if (!imported) {
    return {
      plan: { action: 'hold', reason: 'not_imported' },
      droppedMembership: false,
      droppedPairing: false,
      storedCount: 0,
      readableCount: 0,
    };
  }

  const pulled = await io.pullReadable(userId);
  const storedCount = pulled.ok ? await io.persistRows(userId, pulled.rows) : 0;
  const plan = planLegacyGraphRetract({
    imported: true,
    pullSucceeded: pulled.ok,
    readableCount: pulled.ok ? pulled.rows.length : 0,
    storedCount,
  });

  if (plan.action !== 'drop_membership') {
    return {
      plan,
      droppedMembership: false,
      droppedPairing: false,
      storedCount,
      readableCount: pulled.ok ? pulled.rows.length : 0,
    };
  }

  await io.deleteOwnMemberships(userId);
  await io.deleteOwnContactRequests(userId);
  return {
    plan,
    droppedMembership: true,
    droppedPairing: true,
    storedCount,
    readableCount: pulled.rows.length,
  };
}
