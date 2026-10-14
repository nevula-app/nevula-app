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

describe('inAppUnread source', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'inAppUnread.ts'), 'utf8');

  it('tracks unread independently of OS notification prefs', () => {
    expect(src).toMatch(/nevula\.inapp\.unread\.v1/);
    expect(src).toMatch(/noteInAppUnreadMessage/);
    expect(src).toMatch(/acknowledgeInAppUnreadIds/);
    expect(src).toMatch(/byConversation/);
    expect(src).toMatch(/acknowledgeInAppUnreadForConversation/);
    expect(src).toMatch(/conversations/);
    expect(src).toMatch(/acknowledgeInAppUnreadOrphans/);
    expect(src).toMatch(/acknowledgeInAppUnreadAfterOpeningChat/);
    expect(src).toMatch(/acknowledgeAllInAppUnreadOrphans/);
    expect(src).toMatch(/reconcileInAppUnread/);
    expect(src).toMatch(/subscribeInAppUnreadSnapshot/);
    expect(src).toMatch(/unreadCountLabel/);
    expect(src).toMatch(/1 new message/);
    expect(src).toMatch(/new messages/);
  });
});

describe('messageAlerts in-app unread', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'messageAlerts.ts'), 'utf8');

  it('alerts after decrypt or INSERT fallback; inbox receive bypass', () => {
    expect(src).toMatch(/notifyNewInboundChatMessage/);
    expect(src).toMatch(/scheduleInsertAlertFallback/);
    expect(src).toMatch(/withInboxReceiveAllowed/);
    expect(src).toMatch(/consumeSealedChatBlobs/);
    expect(src).toMatch(/isNvl3ChatBlobCiphertext/);
    expect(src).toMatch(/presentDisguisedMessageAlert/);
    expect(src).toMatch(/BACKGROUND_POLL_MS/);
    expect(src).toMatch(/scheduleWarmBackgroundChecks/);
    expect(src).toMatch(/consumeInboxQuiet/);
    expect(src).toMatch(/runMessageInboxBackgroundCheck/);
    expect(src).toMatch(/noteRemainingServerBlobs/);
    expect(src).not.toMatch(/markSealedBlobArrival/);
  });
});
