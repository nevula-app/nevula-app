// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Local pairwise contact label for UI / future routing — not a server ID.
 * Same peer yields the same label on this device; different devices get different
 * crypto identities (new device = new keys), so labels are not globally correlatable.
 */
export function localPairwiseContactLabel(myUserId: string, peerUserId: string): string {
  const a = myUserId.trim().toLowerCase();
  const b = peerUserId.trim().toLowerCase();
  if (!a || !b) throw new Error('Pairwise label requires both user ids.');
  const [left, right] = a < b ? [a, b] : [b, a];
  // Stable, non-reversible-looking short tag for local UI only (not for crypto).
  let h = 2166136261;
  const input = `nvl-pair:${left}:${right}`;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).padStart(8, '0');
  return `pct-${hex}`;
}
