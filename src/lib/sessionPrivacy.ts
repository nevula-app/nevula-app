// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { supabase } from './supabase';
import { retractPublishedDirectory } from './identity';
import { privacyEvent } from './privacyLog';
import { isMissingRelation } from './sealedDelivery';

/**
 * Session / device privacy helpers for wipe and account teardown.
 * New device = new cryptographic identity remains enforced by local key wipe
 * (PGP, P256, ratchet) — never reuse crypto material across devices.
 */

/** Best-effort: remove undelivered inbox ciphertext while the session is still valid. */
export async function purgeOwnSealedInboxOnServer(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('message_blobs').delete().eq('recipient_id', userId);
    if (error) {
      if (isMissingRelation(error)) return true;
      privacyEvent('session.inbox_purge.fail');
      return false;
    }
    privacyEvent('session.inbox_purge.ok');
    return true;
  } catch {
    privacyEvent('session.inbox_purge.fail');
    return false;
  }
}

/**
 * Invalidate the current auth session as strongly as the client can.
 * Tries global revoke (refresh token invalid on server), then always clears local.
 */
export async function revokeAuthSession(): Promise<'global' | 'local'> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (!error) {
      privacyEvent('session.revoke.ok');
      return 'global';
    }
  } catch {
    // Fall through to local.
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  privacyEvent('session.revoke.partial');
  return 'local';
}

/**
 * Run while a session may still be usable: retract directory, purge inbox, revoke auth.
 * Does not wipe local SecureStore — callers continue with wipeIdentity / wipeAllVaultData.
 */
export async function prepareSessionTeardown(userId: string | null | undefined) {
  if (userId) {
    try {
      await retractPublishedDirectory(userId);
      privacyEvent('session.directory_retract.ok');
    } catch {
      privacyEvent('session.directory_retract.fail');
    }
    await purgeOwnSealedInboxOnServer(userId);
  }
  await revokeAuthSession();
}
