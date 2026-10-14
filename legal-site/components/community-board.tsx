'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import {
  Bug,
  CircleHelp,
  Lightbulb,
  ShieldCheck,
  LifeBuoy,
  ArrowRight,
} from 'lucide-react';
import { BrandHeadliner, BrandWord, SiteShell } from '@/components/site-shell';
import { CommunityLogout } from '@/components/community-auth-form';
import { useI18n } from '@/components/i18n-provider';

type Post = {
  id: string;
  title: string;
  category: string;
  nickname: string;
  role: string;
  replies: number;
};

export function CommunityBoard({
  member,
  login,
  password,
  posts,
}: {
  member: { nickname: string } | null;
  login?: string;
  password?: string;
  posts: Post[];
}) {
  const { t } = useI18n();
  const categoryNames: Record<string, string> = {
    bug: t.community.catBugs,
    question: t.community.catQuestions,
    idea: t.community.catIdeas,
  };

  const loginError =
    login === 'missing'
      ? t.community.loginMissing
      : login === 'unavailable'
        ? t.community.loginUnavailable
        : login
          ? t.community.loginExpired
          : null;

  return (
    <SiteShell>
      <BrandHeadliner space />
      <section className="communityHero">
        <p className="lede">{t.community.intro}</p>
        {loginError && (
          <div className="loginError" role="alert">
            {loginError}
          </div>
        )}
        {member && (
          <p className="authHint">
            {t.community.signedInAs} <strong>{member.nickname}</strong>
          </p>
        )}
        {member && password === 'updated' && (
          <p role="status">{t.community.passwordUpdated}</p>
        )}
        <div className="communityActions">
          {member ? (
            <>
              <a className="primaryLink" href="/community/new">
                {t.community.newPost} <ArrowRight size={16} />
              </a>
              <a className="secondaryLink" href="/community/password">
                {t.community.access}
              </a>
              <CommunityLogout />
            </>
          ) : (
            <>
              <a className="primaryLink" href="/community/login">
                {t.community.login}
              </a>
              <a className="secondaryLink" href="/community/register">
                {t.community.createAccess}
              </a>
              <div className="memberNotice">
                <ShieldCheck size={18} />
                <span>{t.community.hint}</span>
              </div>
            </>
          )}
          <a className="secondaryLink" href="/help">
            <LifeBuoy size={17} /> {t.community.supportHelp}
          </a>
        </div>
      </section>
      <section className="categoryGrid">
        <a className="categoryCard" href="/community/new?category=bug">
          <Bug />
          <h2>{t.community.catBugs}</h2>
          <p>{t.community.catBugCopy}</p>
          <span>{t.community.catBugCta}</span>
        </a>
        <a className="categoryCard" href="/community/new?category=question">
          <CircleHelp />
          <h2>{t.community.catQuestions}</h2>
          <p>{t.community.catQCopy}</p>
          <span>{t.community.catQCta}</span>
        </a>
        <a className="categoryCard" href="/community/new?category=idea">
          <Lightbulb />
          <h2>{t.community.catIdeas}</h2>
          <p>{t.community.catIdeaCopy}</p>
          <span>{t.community.catIdeaCta}</span>
        </a>
      </section>
      <section className="forumLayout">
        <div>
          <div className="forumHeading">
            <div>
              <p className="eyebrow">{t.community.publicEyebrow}</p>
              <h2>{t.community.latestTitle}</h2>
            </div>
          </div>
          <div className="postList">
            {posts.length ? (
              posts.map((post) => (
                <a
                  key={post.id}
                  className="postCard"
                  href={`/community/questions/${post.id}`}
                >
                  <span className="category">
                    {categoryNames[post.category] ?? t.community.catQuestions}
                  </span>
                  <h3>{post.title}</h3>
                  <p>
                    {t.community.by} {post.nickname}{' '}
                    {post.role !== 'member' && (
                      <strong className="official">
                        Official · <BrandWord /> Team
                      </strong>
                    )}
                  </p>
                  <span>
                    {post.replies} {t.community.replies}
                  </span>
                </a>
              ))
            ) : (
              <div className="emptyCommunity">
                <h3>{t.community.empty}</h3>
                <p>{t.community.emptyHint}</p>
                <div className="emptyCommunityActions">
                  {member ? (
                    <a className="primaryLink btnPrimary" href="/community/new">
                      {t.community.emptyNew}
                    </a>
                  ) : (
                    <>
                      <a className="primaryLink btnPrimary" href="/community/login">
                        {t.community.login}
                      </a>
                      <a className="secondaryLink btnSecondary" href="/community/register">
                        {t.community.createAccess}
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <nav className="communityFooterLinks" aria-label={t.community.footerAria}>
        <a href="/community/rules">{t.community.rulesLink}</a>
        <a href="/privacy">{t.nav.privacy}</a>
        <a href="/delete">{t.nav.delete}</a>
        <a href="/help">{t.community.supportHelp}</a>
        <a href="/support">{t.nav.contribute}</a>
      </nav>
      <p className="communityOfficialNote">{t.community.officialNote}</p>
    </SiteShell>
  );
}
