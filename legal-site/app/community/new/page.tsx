// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BrandCompound, BrandWord, SiteShell } from '@/components/site-shell';
import { NewPostForm } from '@/components/community-actions';
import { isAdmin, memberFromCookie } from '@/lib/community-db';

export const dynamic = 'force-dynamic';

export default async function NewPost({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const member = await memberFromCookie((await headers()).get('cookie'));
  if (!member) redirect('/community/login');
  const admin = isAdmin(member);
  const requested = (await searchParams).category;
  const allowed = admin
    ? ['bug', 'question', 'idea', 'announcement']
    : ['bug', 'question', 'idea'];
  const category = allowed.includes(requested ?? '') ? requested : 'question';
  return (
    <SiteShell>
      <article className="document">
        <header>
          <p className="eyebrow">
            <BrandWord /> COMMUNITY
          </p>
          <h1>Eigenen Beitrag erstellen</h1>
          <p className="lede">
            Dein Community-Nickname ist öffentlich. Deine <BrandCompound suffix="ID" /> und
            Messenger-Aktivitäten werden nicht angezeigt.
          </p>
        </header>
        <NewPostForm nickname={member.nickname} category={category} isAdmin={admin} />
      </article>
    </SiteShell>
  );
}
