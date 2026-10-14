'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { AuthMistMark, BrandWord, SiteShell } from '@/components/site-shell';
import { CommunityAuthForm } from '@/components/community-auth-form';
import { useI18n } from '@/components/i18n-provider';

export function LoginView() {
  const { t } = useI18n();
  return (
    <SiteShell>
      <article className="document authDocument authFriendly">
        <AuthMistMark />
        <p className="eyebrow">
          <BrandWord /> {t.community.banner.replace('NEVULA ', '')}
        </p>
        <h1>{t.login.title}</h1>
        <p className="lede">{t.login.subtitle}</p>
        <CommunityAuthForm mode="login" />
        <section className="authInfo">
          <h2>
            <a className="authInfoLink" href="/community/register">
              {t.login.noAccessTitle}
            </a>
          </h2>
          <p>{t.login.noAccessBody}</p>
        </section>
      </article>
    </SiteShell>
  );
}
