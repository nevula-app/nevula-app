// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, sha256 } from '@/lib/community-db';
import { authResponse, cookie, cookieValue, sameOriginJson, SESSION_COOKIE, SETUP_COOKIE } from '@/lib/community-auth';
export async function POST(request: Request) {
  if (!sameOriginJson(request)) return authResponse({ error: 'Ungültige Anfrage.' }, 403);
  const database = await db();
  const session = cookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  const setup = cookieValue(request.headers.get('cookie'), SETUP_COOKIE);
  if (session) await database.prepare('DELETE FROM community_sessions WHERE token_hash=?').bind(await sha256(session)).run();
  if (setup) await database.prepare('DELETE FROM community_setup_grants WHERE token_hash=?').bind(await sha256(setup)).run();
  return authResponse({ next: '/community' }, 200, [cookie(SESSION_COOKIE, '', 0), cookie(SETUP_COOKIE, '', 0)]);
}
