'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { DocumentPage } from '@/components/site-shell';
import { DeletionForm } from '@/components/deletion-form';
import { useI18n } from '@/components/i18n-provider';

export default function DeletePageView() {
  const { t, locale } = useI18n();
  const linkLabel = locale === 'de' ? 'Datenschutz §2' : 'Privacy §2';
  const parts = t.delete.aBody.split(linkLabel);

  return (
    <DocumentPage
      eyebrow={t.delete.kicker}
      title={t.delete.title}
      intro={t.delete.intro}
      updated={t.delete.updated}
    >
      <section className="deletePath deletePathLocal">
        <h2>{t.delete.aTitle}</h2>
        <p>
          {parts[0]}
          <a href="/privacy#calculator-gate">{linkLabel}</a>
          {parts[1] ?? ''}
        </p>
      </section>

      <section className="deletePath deletePathOnline">
        <h2>{t.delete.bTitle}</h2>
        <p>{t.delete.bBody}</p>
      </section>

      <DeletionForm />

      <section>
        <p>
          {t.delete.help} <a href="/help">{t.community.supportHelp}</a>
        </p>
      </section>
      <section>
        <p>{t.delete.remain}</p>
      </section>
    </DocumentPage>
  );
}
