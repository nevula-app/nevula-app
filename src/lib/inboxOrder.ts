// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/** Oldest send first. Equal expiry uses the ratchet counter, never the newest blob. */
export function sortInboxOldestFirst<T extends { expires_at?: string | null; chainCounter?: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ae = Date.parse(a.expires_at ?? '');
    const be = Date.parse(b.expires_at ?? '');
    const an = Number.isFinite(ae) ? ae : Number.POSITIVE_INFINITY;
    const bn = Number.isFinite(be) ? be : Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return (a.chainCounter ?? Number.POSITIVE_INFINITY) - (b.chainCounter ?? Number.POSITIVE_INFINITY);
  });
}

export type InboxPlanRow = { id: string; expires_at: string; chainId: string | null; chainCounter?: number };

/**
 * One pass: try oldest first. A failure blocks the rest of that chain for this pass.
 * Those blobs stay and are tried again later. Other chains continue.
 */
export function planInboxPass(rows: readonly InboxPlanRow[], opens: (id: string) => boolean): { tried: string[]; left: string[] } {
  const blocked = new Set<string>();
  const tried: string[] = [];
  const left: string[] = [];
  for (const row of sortInboxOldestFirst(rows)) {
    if (row.chainId && blocked.has(row.chainId)) {
      left.push(row.id);
      continue;
    }
    tried.push(row.id);
    if (!opens(row.id) && row.chainId) blocked.add(row.chainId);
  }
  return { tried, left };
}
