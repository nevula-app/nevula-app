// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db } from '@/lib/community-db';
import { authResponse, cookie, createSession, rateLimit, readAuthBody, SESSION_COOKIE, SESSION_SECONDS, SETUP_COOKIE } from '@/lib/community-auth';
import { validNickname, validPassword, verifyPassword } from '@/lib/community-password';
export async function POST(request: Request) {
  const input = await readAuthBody(request);
  if (!input) return authResponse({ error: 'Ungültige Anfrage.' }, 400);
  const name = typeof input.nickname === 'string' ? input.nickname.trim() : '';
  if (!validNickname(name) || !validPassword(input.password)) return authResponse({ error: 'Community-Name oder Passwort ist nicht korrekt.' }, 401);
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!await rateLimit('login-ip:' + ip, 30) || !await rateLimit('login-name:' + name.toLowerCase(), 10))
    return authResponse({ error: 'Zu viele Anmeldeversuche. Bitte versuche es in 15 Minuten erneut.' }, 429);
  const database = await db();
  const credential = await database.prepare(`SELECT c.user_id,c.password_hash,m.suspended_at FROM community_credentials c
    JOIN community_members m ON m.user_id=c.user_id WHERE c.login_name=? COLLATE NOCASE`)
    .bind(name).first<{ user_id: string; password_hash: string; suspended_at: string | null }>();
  const correct = verifyPassword(input.password, credential?.password_hash ?? null);
  if (!correct || !credential || credential.suspended_at !== null) return authResponse({ error: 'Community-Name oder Passwort ist nicht korrekt.' }, 401);
  const token = await createSession(credential.user_id, credential.password_hash);
  if (!token) return authResponse({ error: 'Bitte melde dich erneut an.' }, 401);
  return authResponse({ next: '/community' }, 200, [cookie(SESSION_COOKIE, token, SESSION_SECONDS), cookie(SETUP_COOKIE, '', 0)]);
}
