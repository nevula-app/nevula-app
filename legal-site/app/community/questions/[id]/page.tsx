// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { BrandWord, SiteShell } from '@/components/site-shell';
import { DiscussionFooter, ReportButton } from '@/components/community-actions';
import { CommunityPostTitle } from '@/components/community-post-title';
import { canViewDraft, db, isAdmin, memberFromCookie } from '@/lib/community-db';

export const dynamic = 'force-dynamic';

export default async function Question({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;
  const database = await db();
  const post = await database
    .prepare(
      `SELECT p.id,p.title,p.body,p.category,p.created_at,p.locked_at,p.pinned_at,p.status,p.preview_token,m.nickname,m.role FROM community_posts p JOIN community_members m ON m.user_id=p.author_id WHERE p.id=? AND p.deleted_at IS NULL`,
    )
    .bind(id)
    .first<{
      id: string;
      title: string;
      body: string;
      category: string;
      created_at: string;
      locked_at: string | null;
      pinned_at: string | null;
      status: string;
      preview_token: string | null;
      nickname: string;
      role: string;
    }>();
  if (!post) notFound();

  const member = await memberFromCookie((await headers()).get('cookie'));
  if (post.status === 'draft' && !canViewDraft(member, post.preview_token, preview)) {
    notFound();
  }

  const replies = await database
    .prepare(
      `SELECT r.id,r.body,r.created_at,m.nickname,m.role FROM community_replies r JOIN community_members m ON m.user_id=r.author_id WHERE r.post_id=? AND r.deleted_at IS NULL ORDER BY r.created_at`,
    )
    .bind(id)
    .all<{ id: string; body: string; created_at: string; nickname: string; role: string }>();

  const categoryLabel =
    post.category === 'announcement'
      ? 'ANNOUNCEMENT'
      : post.category === 'bug'
        ? 'BUG'
        : post.category === 'idea'
          ? 'IDEA'
          : post.category.toUpperCase();
  const published = post.status === 'published';
  const canReply = Boolean(member && !post.locked_at && published);

  return (
    <SiteShell>
      <article className="discussion">
        {post.status === 'draft' && (
          <div className="draftWarning" role="status">
            <strong>Draft preview</strong>
            <p>This post is not public. Only admins and people with the preview link can see it.</p>
          </div>
        )}
        <p className="eyebrow">
          {post.pinned_at ? 'PINNED · ' : ''}
          {categoryLabel}
        </p>
        <CommunityPostTitle id={post.id} title={post.title} />
        <div className="authorLine">
          {post.role !== 'member' ? (
            <strong className="official">
              Official · <span className="teamAuthor"><BrandWord /></span> Team
            </strong>
          ) : (
            <span>{post.nickname}</span>
          )}
          {published && <ReportButton postId={post.id} />}
        </div>
        <p className="postBody">{post.body}</p>
        <section className="replyList">
          <h2>{replies.results.length} replies</h2>
          {replies.results.map((reply) => (
            <article className="reply" key={reply.id}>
              <div className="authorLine">
                {reply.role !== 'member' ? (
                  <span className="official">
                    Official · <span className="teamAuthor"><BrandWord /></span> Team
                  </span>
                ) : (
                  <strong>{reply.nickname}</strong>
                )}
                {published && <ReportButton replyId={reply.id} />}
              </div>
              <p>{reply.body}</p>
            </article>
          ))}
        </section>
        <DiscussionFooter
          postId={id}
          canReply={canReply}
          locked={Boolean(post.locked_at)}
          published={published}
          isAdminMember={isAdmin(member)}
        />
      </article>
    </SiteShell>
  );
}
