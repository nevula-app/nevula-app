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

export function RegisterView({ hasGrant }: { hasGrant: boolean }) {
  const { t, locale } = useI18n();
  return (
    <SiteShell>
      <article className="document authDocument authFriendly">
        <AuthMistMark />
        <p className="eyebrow">
          {locale === 'de' ? 'DEIN PLATZ IN' : 'YOUR PLACE IN'} <BrandWord /> SPACE
        </p>
        {hasGrant ? (
          <>
            <h1>{t.register.chooseNameTitle}</h1>
            <p className="lede">{t.register.chooseNameBody}</p>
            <CommunityAuthForm mode="register" />
          </>
        ) : (
          <>
            <h1>{t.register.title}</h1>
            <p className="lede">{t.register.body}</p>
            <div className="authCtaRow">
              <a className="secondaryLink btnSecondary" href="/community/login">
                {t.register.haveAccess}
              </a>
            </div>
          </>
        )}
      </article>
    </SiteShell>
  );
}
