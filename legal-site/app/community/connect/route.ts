// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, randomToken, sha256 } from '@/lib/community-db';
import { cookie, createSession, SESSION_COOKIE, SESSION_SECONDS, SETUP_COOKIE } from '@/lib/community-auth';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  function redirect(path: string) { headers.set('Location', path); return new Response(null, { status: 303, headers }); }
  if (!code || !/^[a-f0-9]{64}$/.test(code)) return redirect('/community?login=missing');
  const database = await db(); const now = Date.now();
  const row = await database.prepare(`UPDATE community_login_codes SET used_at=?
    WHERE code_hash=? AND used_at IS NULL AND expires_at>? RETURNING user_id`)
    .bind(now, await sha256(code), now).first<{ user_id: string }>();
  if (!row) return redirect('/community?login=expired');
  // Never derive a public nickname from the private account identifier.
  await database.prepare('INSERT OR IGNORE INTO community_members(user_id,nickname) VALUES(?,?)')
    .bind(row.user_id, `Member-${randomToken().slice(0,20)}`).run();
  const member = await database.prepare('SELECT user_id FROM community_members WHERE user_id=? AND suspended_at IS NULL').bind(row.user_id).first();
  if (!member) return redirect('/community?login=unavailable');
  const grant = randomToken();
  await database.batch([
    database.prepare('DELETE FROM community_setup_grants WHERE user_id=? OR expires_at<=?').bind(row.user_id, now),
    database.prepare('INSERT INTO community_setup_grants(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256(grant), row.user_id, now + 10 * 60000),
  ]);
  headers.append('Set-Cookie', cookie(SETUP_COOKIE, grant, 600));
  const token = await createSession(row.user_id);
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, token ?? '', token ? SESSION_SECONDS : 0));
  return redirect(token ? '/community' : '/community/register');
}
