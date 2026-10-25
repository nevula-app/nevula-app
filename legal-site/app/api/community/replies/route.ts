// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, memberFromCookie } from '@/lib/community-db';

export async function POST(request: Request) {
  const member = await memberFromCookie(request.headers.get('cookie'));
  if (!member) return Response.json({ error: 'Verified NEVULA membership required.' }, { status: 401 });
  const input = (await request.json()) as { postId?: string; body?: string };
  const copy = input.body?.trim() ?? '';
  if (!input.postId || copy.length < 2 || copy.length > 3000) {
    return Response.json({ error: 'Reply must contain 2–3000 characters.' }, { status: 400 });
  }
  const database = await db();
  const recent = await database
    .prepare(
      `SELECT count(*) n FROM community_replies WHERE author_id=? AND created_at>datetime('now','-10 minutes')`,
    )
    .bind(member.user_id)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 10) {
    return Response.json({ error: 'Please wait before posting another reply.' }, { status: 429 });
  }
  const post = await database
    .prepare(
      `SELECT id FROM community_posts WHERE id=? AND deleted_at IS NULL AND locked_at IS NULL AND status='published'`,
    )
    .bind(input.postId)
    .first();
  if (!post) {
    return Response.json({ error: 'This discussion is unavailable or locked.' }, { status: 409 });
  }
  await database
    .prepare(`INSERT INTO community_replies(id,post_id,author_id,body) VALUES(?,?,?,?)`)
    .bind(crypto.randomUUID(), input.postId, member.user_id, copy)
    .run();
  return Response.json({ ok: true });
}
