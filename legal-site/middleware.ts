// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, type Locale } from '@/lib/i18n';

const COOKIE = 'nevula.lang';

function fromAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en';
  const primary = header.split(',')[0]?.trim().toLowerCase() ?? '';
  if (primary.startsWith('de')) return 'de';
  if (primary.startsWith('en')) return 'en';
  return 'en';
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/NevNote' || request.nextUrl.pathname.startsWith('/NevNote/')) return NextResponse.next();
  const urlLang = request.nextUrl.searchParams.get('lang');
  const cookieLang = request.cookies.get(COOKIE)?.value;
  let locale: Locale | null = isLocale(urlLang) ? urlLang : null;

  if (!locale && isLocale(cookieLang)) locale = cookieLang;
  if (!locale) locale = fromAcceptLanguage(request.headers.get('accept-language'));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nevula-lang', locale);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set(COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$).*)'],
};
