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

export function PasswordView({
  nickname,
}: {
  nickname: string | null;
}) {
  const { t } = useI18n();
  return (
    <SiteShell>
      <article className="document authDocument authFriendly">
        <AuthMistMark />
        <p className="eyebrow">
          <BrandWord /> SPACE
        </p>
        <h1>{t.password.title}</h1>
        {nickname ? (
          <>
            <p className="lede">{t.password.body}</p>
            <CommunityAuthForm mode="reset" nickname={nickname} />
          </>
        ) : (
          <>
            <p className="lede">{t.password.body}</p>
            <a className="secondaryLink" href="/community/login">
              {t.login.submit}
            </a>
          </>
        )}
      </article>
    </SiteShell>
  );
}
