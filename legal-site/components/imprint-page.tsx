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

export default function ImprintPageView() {
  const { t } = useI18n();
  return (
    <DocumentPage
      eyebrow={t.imprint.kicker}
      title={t.imprint.title}
      intro={t.imprint.intro}
      updated={t.imprint.updated}
    >
      <section>
        <h2>{t.imprint.serviceTitle}</h2>
        <p>{t.imprint.serviceBody}</p>
      </section>
      <section>
        <h2>{t.imprint.contactTitle}</h2>
        <p>
          {t.imprint.email.includes('nevula.support@proton.me') ? (
            <>
              {t.imprint.email.split('nevula.support@proton.me')[0]}
              <a href="mailto:nevula.support@proton.me">nevula.support@proton.me</a>
            </>
          ) : (
            t.imprint.email
          )}
        </p>
      </section>
      <section>
        <h2>{t.imprint.operatorTitle}</h2>
        <p style={{ whiteSpace: 'pre-line' }}>{t.imprint.operator}</p>
      </section>
    </DocumentPage>
  );
}
