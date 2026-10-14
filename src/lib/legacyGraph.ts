// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { isMissingRelation } from './sealedDelivery';
import { mergeLegacyInbox, type LegacyInboxRow } from './legacyInbox';
import {
  legacyGraphImportedKey,
  runLegacyGraphRetract,
  type LegacyGraphIo,
  type LegacyMessageRow,
} from './legacyGraphRetract';

function asLegacyRow(row: LegacyMessageRow): LegacyInboxRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    ciphertext: row.ciphertext,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function pullReadableLegacyMessages(): Promise<{ ok: boolean; rows: LegacyMessageRow[] }> {
  const rows: LegacyMessageRow[] = [];
  const pageSize = 1000;
  const now = new Date().toISOString();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('encrypted_messages')
      .select('id,conversation_id,sender_id,ciphertext,created_at,expires_at')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      if (isMissingRelation(error) && from === 0) return { ok: true, rows: [] };
      return { ok: false, rows: [] };
    }
    const page = (data ?? []) as LegacyMessageRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { ok: true, rows };
}

async function persistLegacyRows(userId: string, rows: LegacyMessageRow[]) {
  const stored = await mergeLegacyInbox(userId, rows.map(asLegacyRow));
  const ids = new Set(stored.map(row => row.id));
  return rows.filter(row => ids.has(row.id)).length;
}

async function deleteOwnMemberships(userId: string) {
  const { error } = await supabase.from('conversation_members').delete().eq('user_id', userId);
  if (error && !isMissingRelation(error) && error.code !== '42501') {
    throw error;
  }
}

async function deleteOwnContactRequests(userId: string) {
  const { error } = await supabase
    .from('contact_requests')
    .delete()
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
  if (error && !isMissingRelation(error) && error.code !== '42501') {
    // Pairing DELETE may still be missing on a live project that has not applied it.
  }
}

const liveIo: LegacyGraphIo = {
  hasImported: async userId => Boolean(await SecureStore.getItemAsync(legacyGraphImportedKey(userId))),
  pullReadable: async () => pullReadableLegacyMessages(),
  persistRows: persistLegacyRows,
  deleteOwnMemberships,
  deleteOwnContactRequests,
};

/** After the one-shot local import (or if that flag is already set): pull readable leftover ciphertext, then drop own membership. */
export async function retractOwnLegacyGraph(userId: string) {
  return runLegacyGraphRetract(userId, liveIo);
}

export async function retractOwnLegacyGraphIfSignedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  await retractOwnLegacyGraph(session.user.id);
}
