// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, randomToken, sha256 } from '@/lib/community-db';
import { authResponse, cookie, rateLimit, readAuthBody, SESSION_COOKIE, SESSION_SECONDS, SETUP_COOKIE, setupFromCookie } from '@/lib/community-auth';
import { hashPassword, validNickname, validPassword } from '@/lib/community-password';
export async function POST(request: Request) {
  const input = await readAuthBody(request);
  if (!input) return authResponse({ error: 'Ungültige Anfrage.' }, 400);
  const grant = await setupFromCookie(request.headers.get('cookie'));
  if (!grant) return authResponse({ error: 'Bitte öffne NEVULA Space erneut aus der entsperrten App.' }, 401);
  if (!await rateLimit('setup:' + grant.user_id, 10)) return authResponse({ error: 'Bitte versuche es in 15 Minuten erneut.' }, 429);
  const nickname = grant.login_name ?? (typeof input.nickname === 'string' ? input.nickname.trim() : '');
  if (!validNickname(nickname)) return authResponse({ error: 'Wähle 3–30 Zeichen: Buchstaben A–Z, Zahlen, Punkt, Unterstrich oder Bindestrich. Beginne mit einem Buchstaben oder einer Zahl.' }, 400);
  if (!validPassword(input.password) || input.password !== input.confirmPassword) return authResponse({ error: 'Verwende 15–128 Zeichen und wiederhole das Passwort identisch.' }, 400);
  const database = await db();
  const taken = await database.prepare('SELECT user_id FROM community_members WHERE nickname=? COLLATE NOCASE AND user_id<>?').bind(nickname, grant.user_id).first();
  if (taken) return authResponse({ error: 'Dieser Community-Name ist bereits vergeben.' }, 409);
  const passwordHash = hashPassword(input.password);
  const consumed = await database.prepare(`DELETE FROM community_setup_grants WHERE token_hash=? AND expires_at>?
    AND EXISTS(SELECT 1 FROM community_members WHERE user_id=community_setup_grants.user_id AND suspended_at IS NULL) RETURNING user_id`)
    .bind(grant.token_hash, Date.now()).first();
  if (!consumed) return authResponse({ error: 'Die Bestätigung ist abgelaufen. Bitte öffne den Space erneut aus der App.' }, 401);
  const token = randomToken(); const now = Date.now();
  try {
    await database.batch([
      database.prepare('UPDATE community_members SET nickname=? WHERE user_id=?').bind(nickname, grant.user_id),
      database.prepare(`INSERT INTO community_credentials(user_id,login_name,password_hash,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at`).bind(grant.user_id, nickname, passwordHash, now),
      database.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(grant.user_id),
      database.prepare('DELETE FROM community_setup_grants WHERE user_id=?').bind(grant.user_id),
      database.prepare('INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha256(token), grant.user_id, now + SESSION_SECONDS * 1000, now),
    ]);
  } catch {
    return authResponse({ error: 'Der Zugang konnte nicht gespeichert werden. Bitte öffne den Space erneut aus der App und versuche gegebenenfalls einen anderen Namen.' }, 409);
  }
  return authResponse({ next: grant.login_name ? '/community?password=updated' : '/community/welcome' }, 200,
    [cookie(SESSION_COOKIE, token, SESSION_SECONDS), cookie(SETUP_COOKIE, '', 0)]);
}
