// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { wipeCalendar } from './calendar';
import { wipeIdentity } from './identity';
import { wipeIdentityRecoveryCredentials } from './identityRecovery';
import { wipeVaultKey } from './localCrypto';
import { wipeMediaVault } from './media';
import { wipeNotes } from './notes';
import { wipeNotificationPreferences } from './notificationPreferences';
import { unregisterRemotePushTokens } from './remotePush';
import { wipeInAppUnread } from './inAppUnread';
import { wipeMessagesListCache } from './messagesListCache';
import { wipePgpIdentity } from './pgp';
import { wipeMessageCrypto } from './messageCrypto';
import { wipeRatchetSessions } from './sessionRatchet';
import { wipeAllOutboxes } from './outbox';
import { wipeAllLegacyInboxes } from './legacyInbox';
import { wipeAllSealedInboxes } from './sealedInbox';
import { clearUnlockCode, clearWipeCode, resetLockout } from './unlock';
import { clearUnlockSession } from './unlockSession';
import { clearVoicePlaybackCache } from './voiceMessages';
import { wipeContactInvites } from './contactInvites';
import { clearPendingContactInvite } from './pendingContactInvite';
import { wipePresencePrivacyPreferences } from './privacyPreferences';
import { prepareSessionTeardown } from './sessionPrivacy';
import { supabase } from './supabase';
import { wipeAvatars } from './profileAvatar';

export async function wipePrivateContent() {
  const results = await Promise.allSettled([
    wipeNotes(),
    wipeMediaVault(),
    wipeCalendar(),
    clearVoicePlaybackCache(),
  ]);
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Private content wipe incomplete');
  }
}

export async function wipeAllVaultData() {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  await prepareSessionTeardown(session?.user?.id).catch(() => undefined);
  if (session?.user?.id) {
    await unregisterRemotePushTokens(session.user.id).catch(() => undefined);
  }

  const results = await Promise.allSettled([
    wipeContactInvites(),
    clearPendingContactInvite(),
    wipePresencePrivacyPreferences(),
    wipeNotes(),
    wipeMediaVault(),
    wipeCalendar(),
    wipePgpIdentity(),
    wipeMessageCrypto(),
    wipeRatchetSessions(),
    wipeAllOutboxes(),
    wipeAllLegacyInboxes(),
    wipeAllSealedInboxes(),
    wipeNotificationPreferences(),
    wipeInAppUnread(),
    wipeMessagesListCache(),
    wipeIdentity(),
    wipeIdentityRecoveryCredentials(),
    wipeVaultKey(),
    clearVoicePlaybackCache(),
    clearUnlockCode(),
    clearWipeCode(),
    clearUnlockSession(),
    resetLockout(),
  ]);
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Gallery wipe incomplete');
  }
}
