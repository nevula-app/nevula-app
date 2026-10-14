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

describe('remote push source', () => {
  it('registers tokens and notifies without ciphertext', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'remotePush.ts'), 'utf8');
    expect(src).toMatch(/device_push_tokens/);
    expect(src).toMatch(/getDevicePushTokenAsync/);
    expect(src).toMatch(/notify-message-push/);
    expect(src).toMatch(/nevulaRawFetch/);
    expect(src).not.toMatch(/getExpoPushTokenAsync/);
    expect(src).not.toMatch(/ciphertext/);
  });

  it('send path requests remote push only for real chat bodies', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'messaging.ts'), 'utf8');
    expect(src).toMatch(/requestRemoteMessagePush/);
    expect(src).toMatch(/isNevTorCapabilityPlaintext/);
  });

  it('edge function only sends Calculator disguise', () => {
    const src = readFileSync(
      join(process.cwd(), 'supabase', 'functions', 'notify-message-push', 'index.ts'),
      'utf8',
    );
    expect(src).toMatch(/Please return to your calculator/);
    expect(src).toMatch(/fcm\.googleapis\.com\/v1\/projects/);
    expect(src).toMatch(/nevulaMessageAlert/);
    expect(src).toMatch(/direct_boot_ok/);
    expect(src).toMatch(/android:\s*\{[\s\S]*notification:/);
    expect(src).not.toMatch(/ciphertext/);
  });
});
