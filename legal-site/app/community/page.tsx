// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CommunityBoard } from '@/components/community-board';
import { db, memberFromCookie } from '@/lib/community-db';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Questions, ideas and discussion about NEVULA.',
};

export const dynamic = 'force-dynamic';

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string; password?: string }>;
}) {
  const member = await memberFromCookie((await headers()).get('cookie'));
  const { login, password } = await searchParams;
  const database = await db();
  const posts = await database
    .prepare(
      `SELECT p.id,p.title,p.category,p.created_at,m.nickname,m.role,(SELECT count(*) FROM community_replies r WHERE r.post_id=p.id AND r.deleted_at IS NULL) replies FROM community_posts p JOIN community_members m ON m.user_id=p.author_id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 30`,
    )
    .all<{
      id: string;
      title: string;
      category: string;
      created_at: string;
      nickname: string;
      role: string;
      replies: number;
    }>();

  return (
    <CommunityBoard
      member={member ? { nickname: member.nickname } : null}
      login={login}
      password={password}
      posts={posts.results}
    />
  );
}
