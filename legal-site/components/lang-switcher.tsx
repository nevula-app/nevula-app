'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useI18n } from '@/components/i18n-provider';
import type { Locale } from '@/lib/i18n';

export function LangSwitcher() {
  const { locale, setLocale, t } = useI18n();

  const pick = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  return (
    <div className="langSwitcher" role="group" aria-label={`${t.lang.de} / ${t.lang.en}`}>
      <button
        type="button"
        className={locale === 'de' ? 'isActive' : undefined}
        aria-pressed={locale === 'de'}
        aria-label={t.lang.de}
        onClick={() => pick('de')}
      >
        {t.lang.de}
      </button>
      <span className="langSwitcherSep" aria-hidden>
        |
      </span>
      <button
        type="button"
        className={locale === 'en' ? 'isActive' : undefined}
        aria-pressed={locale === 'en'}
        aria-label={t.lang.en}
        onClick={() => pick('en')}
      >
        {t.lang.en}
      </button>
    </div>
  );
}
