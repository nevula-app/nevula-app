// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

/**
 * Presence / receipt preferences. Defaults are OFF and stay OFF.
 * These features are not implemented on the wire; the prefs exist so future
 * code cannot silently enable metadata-emitting behaviour.
 */

const KEY = 'nevula.privacy.presence.v1';

export type PresencePrivacyPreferences = {
  /** Share online / last-seen style signals (not implemented). */
  sharePresence: boolean;
  /** Typing indicators (not implemented). */
  shareTyping: boolean;
  /** Read receipts (not implemented). */
  shareReadReceipts: boolean;
  /** Delivery receipts beyond sealed blob delete (not implemented). */
  shareDeliveryReceipts: boolean;
  /** Automatic network media prefetch (not implemented; vault is local). */
  autoDownloadMedia: boolean;
};

export const DEFAULT_PRESENCE_PRIVACY: PresencePrivacyPreferences = {
  sharePresence: false,
  shareTyping: false,
  shareReadReceipts: false,
  shareDeliveryReceipts: false,
  autoDownloadMedia: false,
};

export async function getPresencePrivacyPreferences(): Promise<PresencePrivacyPreferences> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return { ...DEFAULT_PRESENCE_PRIVACY };
  try {
    const stored = JSON.parse(raw) as Partial<PresencePrivacyPreferences>;
    return { ...DEFAULT_PRESENCE_PRIVACY, ...stored };
  } catch {
    return { ...DEFAULT_PRESENCE_PRIVACY };
  }
}

export async function savePresencePrivacyPreferences(prefs: PresencePrivacyPreferences) {
  // Hard floor: never persist "on" for wire features that would create presence graphs.
  // When those features ship, they must read these prefs and stay fail-closed if false.
  const next: PresencePrivacyPreferences = {
    sharePresence: Boolean(prefs.sharePresence),
    shareTyping: Boolean(prefs.shareTyping),
    shareReadReceipts: Boolean(prefs.shareReadReceipts),
    shareDeliveryReceipts: Boolean(prefs.shareDeliveryReceipts),
    autoDownloadMedia: Boolean(prefs.autoDownloadMedia),
  };
  await SecureStore.setItemAsync(KEY, JSON.stringify(next), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function wipePresencePrivacyPreferences() {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

/** Gate for any future presence/receipt emitter. */
export async function isPresenceSignalAllowed(
  kind: keyof PresencePrivacyPreferences,
): Promise<boolean> {
  const prefs = await getPresencePrivacyPreferences();
  return prefs[kind] === true;
}
