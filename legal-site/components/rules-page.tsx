'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { DocumentPage } from '@/components/site-shell';
import { useI18n } from '@/components/i18n-provider';

export default function RulesPageView() {
  const { t } = useI18n();
  const sections = ['1', '2', '3', '4', '5'] as const;
  return (
    <DocumentPage
      eyebrow="COMMUNITY"
      title={t.rules.title}
      intro={t.rules.intro}
      updated={t.rules.updated}
    >
      {sections.map((key) => (
        <section key={key}>
          <h2>
            {key}. {t.rules[key].title}
          </h2>
          <p>{t.rules[key].body}</p>
        </section>
      ))}
      <section>
        <p>
          <a href="/community">{t.rules.back}</a>
          {' · '}
          <a href="/privacy">{t.nav.privacy}</a>
          {' · '}
          <a href="/support">{t.nav.contribute}</a>
        </p>
      </section>
    </DocumentPage>
  );
}
