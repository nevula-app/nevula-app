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
import { PrivacyBodyDe } from '@/components/privacy/body-de';
import { PrivacyBodyEn } from '@/components/privacy/body-en';

export default function PrivacyPageView() {
  const { t, locale } = useI18n();
  return (
    <DocumentPage
      eyebrow={t.privacy.kicker}
      title={t.privacy.title}
      intro={t.privacy.intro}
      updated={`${t.chrome.lastUpdatedPrefix} ${t.privacy.updated}`}
    >
      {locale === 'de' ? (
        <PrivacyBodyDe tocLabel={t.privacy.tocLabel} tocAria={t.privacy.tocAria} />
      ) : (
        <PrivacyBodyEn tocLabel={t.privacy.tocLabel} tocAria={t.privacy.tocAria} />
      )}
    </DocumentPage>
  );
}
