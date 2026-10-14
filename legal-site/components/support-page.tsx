'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { DocumentPage } from '@/components/site-shell';
import { ContactForm } from '@/components/contact-form';
import { useI18n } from '@/components/i18n-provider';

export default function SupportPageView() {
  const { t } = useI18n();
  return (
    <DocumentPage
      eyebrow={t.support.kicker}
      title={t.support.title}
      intro={t.support.intro}
      updated={t.support.updated}
    >
      <section>
        <h2>{t.support.beforeTitle}</h2>
        <ol>
          <li>{t.support.before1}</li>
          <li>{t.support.before2}</li>
          <li>{t.support.before3}</li>
        </ol>
      </section>
      <section>
        <h2>{t.support.commonTitle}</h2>
        <p>{t.support.issueDev}</p>
        <p>{t.support.issueWipe}</p>
        <p>{t.support.issuePair}</p>
      </section>
      <section className="formSection">
        <h2>{t.support.contactTitle}</h2>
        <p>{t.support.contactBody}</p>
        <ContactForm />
      </section>
    </DocumentPage>
  );
}
