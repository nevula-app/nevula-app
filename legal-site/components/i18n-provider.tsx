'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  LANG_STORAGE_KEY,
  detectBrowserLocale,
  getDictionary,
  isLocale,
  localeFromSearch,
  type Messages,
  type Locale,
} from '@/lib/i18n';

type I18nContextValue = {
  locale: Locale;
  ready: boolean;
  t: Messages;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readClientLocale(fallback: Locale): Locale {
  if (typeof window === 'undefined') return fallback;
  const fromQuery = localeFromSearch(window.location.search);
  if (fromQuery) return fromQuery;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  const htmlLang = document.documentElement.lang;
  if (isLocale(htmlLang)) return htmlLang;
  return detectBrowserLocale();
}

function persistLocale(next: Locale) {
  document.documentElement.lang = next;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `nevula.lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.history.replaceState({}, '', url.toString());
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = readClientLocale(initialLocale);
    setLocaleState(next);
    persistLocale(next);
    setReady(true);
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      ready,
      t: getDictionary(locale),
      setLocale,
    }),
    [locale, ready, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
