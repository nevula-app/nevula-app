// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMissingFunction, isMissingRelation, PEER_KEY_UNAVAILABLE, SEALED_DELIVERY_UNAVAILABLE } from './sealedDelivery';

describe('sealed delivery fail-closed', () => {
  it('names missing blobs and missing peer keys in English', () => {
    expect(SEALED_DELIVERY_UNAVAILABLE).toMatch(/sealed delivery/i);
    expect(SEALED_DELIVERY_UNAVAILABLE).toMatch(/contact list/i);
    expect(PEER_KEY_UNAVAILABLE).toMatch(/encryption key/i);
    expect(SEALED_DELIVERY_UNAVAILABLE).not.toMatch(/openpgp|pgp/i);
    expect(PEER_KEY_UNAVAILABLE).not.toMatch(/openpgp|pgp/i);
  });

  it('detects a missing relation without treating other errors as absent', () => {
    expect(isMissingRelation({ code: '42P01' })).toBe(true);
    expect(isMissingRelation({ code: 'PGRST205' })).toBe(true);
    expect(isMissingRelation({ message: 'Could not find the table public.message_blobs in the schema cache' })).toBe(true);
    expect(isMissingRelation({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ message: 'Could not find the function public.get_peer_device_key' })).toBe(true);
    expect(isMissingFunction({ code: '42501' })).toBe(false);
  });

  it('does not write new contact_requests rows from the messenger client', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'messaging.ts'), 'utf8');
    expect(src).toMatch(/SEALED_DELIVERY_UNAVAILABLE/);
    expect(src).not.toMatch(/from\('contact_requests'\)[\s\S]{0,160}\.insert\b/);
    expect(src).not.toMatch(/insert\(\s*\{\s*sender_id:\s*senderId,\s*receiver_id:\s*receiverId/);
    expect(src).not.toMatch(/from\('message_retention_defaults'\)[\s\S]{0,120}\.upsert\b/);
    expect(src).not.toMatch(/select\('public_key_armored,fingerprint,device_id'\)/);
    expect(src).not.toMatch(/from\('nevula_profiles'\)/);
    expect(src).not.toMatch(/from\('device_keys'\)/);
    expect(src).not.toMatch(/rpc\('get_peer_device_key'/);
    expect(src).not.toMatch(/rpc\('get_peer_profile'/);
    expect(src).not.toMatch(/\.eq\('nevula_id', nevulaId/);
    expect(src).not.toMatch(/\.in\('user_id', \[\.\.\.peerIds\]\)/);
    expect(src).toMatch(/retractOwnLegacyGraph/);
    expect(src).toMatch(/listLegacyInboxForConversation/);
    expect(src).toMatch(/not\('ciphertext', 'like', `\$\{NVL3_PREFIX\}%`\)/);
    expect(src).toMatch(/like\('ciphertext', `\$\{NVL3_PREFIX\}%`\)/);
    expect(src).toMatch(/consumeSealedChatBlobs/);
    expect(src).toMatch(/mergeSealedInbox/);
    expect(src).toMatch(/deleteOwnBlob/);
    expect(src).toMatch(/purgeExpiredOwnBlobs/);
  });

  it('retracts own leftover membership only after a local history pull', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'legacyGraph.ts'), 'utf8');
    expect(src).toMatch(/from\('encrypted_messages'\)/);
    expect(src).toMatch(/from\('conversation_members'\)\.delete\(\)\.eq\('user_id', userId\)/);
    expect(src).toMatch(/from\('contact_requests'\)[\s\S]{0,80}\.delete\(/);
    expect(src).not.toMatch(/\.insert\b/);
    expect(src).not.toMatch(/from\('nevula_profiles'\)/);
    expect(src).not.toMatch(/from\('device_keys'\)/);
  });

  it('message alerts subscribe only to the caller inbox', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'messageAlerts.ts'), 'utf8');
    expect(src).toMatch(/recipient_id=eq\.\$\{userId\}/);
    expect(src).toMatch(/isVaultUnlocked/);
    expect(src).not.toMatch(/table: 'message_blobs'\s*,\s*\n\s*async \(\) =>/);
  });

  it('does not poll the full ciphertext inbox every few seconds', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'screens', 'MessagesScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/setInterval\(reloadRequests, 4_000\)/);
    expect(src).toMatch(/setInterval\(reloadRequests, 60_000\)/);
    expect(src).toMatch(/loadConversationMessages/);
    expect(src).not.toMatch(/table: 'message_blobs', filter: `recipient_id=eq\.\$\{identity\.userId\}`/);
  });

  it('does not publish profile or device-key directory rows', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'identity.ts'), 'utf8');
    expect(src).toMatch(/PUBLISHED_DEVICE_SLOT = 'primary'/);
    expect(src).toMatch(/retractPublishedDirectory/);
    expect(src).toMatch(/retractOwnLegacyGraph/);
    expect(src).toMatch(/TOKEN_REFRESHED/);
    expect(src).toMatch(/wipeSealedInbox/);
    expect(src).not.toMatch(/from\('nevula_profiles'\)[\s\S]{0,80}\.insert\b/);
    expect(src).not.toMatch(/from\('device_keys'\)[\s\S]{0,80}\.(insert|upsert)\b/);
    expect(src).not.toMatch(/publishDevicePublicKey/);
    expect(src).not.toMatch(/device-\$\{/);
  });
});
