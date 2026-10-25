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
import { NEVNOTE_COMING_SOON_POST_ID } from '@/components/community-post-title';
import { db, isAdmin, memberFromCookie } from '@/lib/community-db';

export const metadata: Metadata = {
  title: 'Community',
  description: 'Questions, ideas and discussion about NEVULA.',
};

export const dynamic = 'force-dynamic';

type BoardPost = {
  id: string;
  title: string;
  category: string;
  created_at: string;
  pinned_at: string | null;
  status: string;
  nickname: string;
  role: string;
  replies: number;
  preview_pin?: boolean;
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string; password?: string; preview?: string }>;
}) {
  const member = await memberFromCookie((await headers()).get('cookie'));
  const { login, password, preview } = await searchParams;
  const database = await db();
  const admin = isAdmin(member);
  const posts = await database
    .prepare(
      admin
        ? `SELECT p.id,p.title,p.category,p.created_at,p.pinned_at,p.status,m.nickname,m.role,(SELECT count(*) FROM community_replies r WHERE r.post_id=p.id AND r.deleted_at IS NULL) replies FROM community_posts p JOIN community_members m ON m.user_id=p.author_id WHERE p.deleted_at IS NULL ORDER BY CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, p.created_at DESC LIMIT 30`
        : `SELECT p.id,p.title,p.category,p.created_at,p.pinned_at,p.status,m.nickname,m.role,(SELECT count(*) FROM community_replies r WHERE r.post_id=p.id AND r.deleted_at IS NULL) replies FROM community_posts p JOIN community_members m ON m.user_id=p.author_id WHERE p.deleted_at IS NULL AND p.status='published' ORDER BY CASE WHEN p.pinned_at IS NULL THEN 1 ELSE 0 END, p.pinned_at DESC, p.created_at DESC LIMIT 30`,
    )
    .all<BoardPost>();

  const boardPosts = [...posts.results];
  const previewToken = preview?.trim() || null;

  if (previewToken) {
    const draftPin = await database
      .prepare(
        `SELECT p.id,p.title,p.category,p.created_at,p.pinned_at,p.status,m.nickname,m.role,(SELECT count(*) FROM community_replies r WHERE r.post_id=p.id AND r.deleted_at IS NULL) replies FROM community_posts p JOIN community_members m ON m.user_id=p.author_id WHERE p.deleted_at IS NULL AND p.status='draft' AND p.category='announcement' AND (p.pinned_at IS NOT NULL OR p.id=?) AND p.preview_token=? LIMIT 1`,
      )
      .bind(NEVNOTE_COMING_SOON_POST_ID, previewToken)
      .first<BoardPost>();
    if (draftPin) {
      const existingIndex = boardPosts.findIndex((post) => post.id === draftPin.id);
      if (existingIndex !== -1) boardPosts.splice(existingIndex, 1);
      boardPosts.unshift({ ...draftPin, preview_pin: true });
    }
  }

  return (
    <CommunityBoard
      member={member ? { nickname: member.nickname, role: member.role } : null}
      login={login}
      password={password}
      previewToken={previewToken}
      posts={boardPosts}
    />
  );
}
