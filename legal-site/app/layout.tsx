// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Geist, Geist_Mono, Montserrat } from 'next/font/google';
import { I18nProvider } from '@/components/i18n-provider';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const nevulaThin = Montserrat({
  variable: '--font-nevula-thin',
  subsets: ['latin'],
  weight: ['200', '300', '400'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nevula.de'),
  title: { default: 'NEVULA · Private Android space', template: '%s · NEVULA' },
  description:
    'Private Android space: chats, notes, calendar and gallery. Optionally disguised as a calculator — without email, without phone number.',
  icons: {
    icon: [
      { url: '/nevula-app-icon.png', type: 'image/png' },
      { url: '/nevula-app-icon.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/nevula-app-icon.png', sizes: '192x192' }],
  },
  openGraph: {
    title: 'NEVULA · Private Android space',
    description: 'Private Android space — without email, without phone number.',
    images: [
      {
        url: '/nevula-feature-graphic-1024x500.png',
        width: 1024,
        height: 500,
        alt: 'NEVULA — PRIVATE MESSENGER',
      },
    ],
  },
};

async function resolveInitialLocale(): Promise<Locale> {
  const headerLang = (await headers()).get('x-nevula-lang');
  if (isLocale(headerLang)) return headerLang;
  const cookieLang = (await cookies()).get('nevula.lang')?.value;
  if (isLocale(cookieLang)) return cookieLang;
  return DEFAULT_LOCALE;
}

const bootScript = `(function(){try{var q=new URLSearchParams(location.search).get('lang');var m=document.cookie.match(/(?:^|; )nevula\\.lang=([^;]*)/);var c=m&&decodeURIComponent(m[1]);var s=null;try{s=localStorage.getItem('nevula.lang')}catch(e){}var n=(navigator.language||'').toLowerCase();var lang=(q==='de'||q==='en')?q:(c==='de'||c==='en')?c:(s==='de'||s==='en')?s:n.indexOf('de')===0?'de':n.indexOf('en')===0?'en':'en';document.documentElement.lang=lang;document.documentElement.dataset.lang=lang;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await resolveInitialLocale();

  return (
    <html lang={initialLocale} className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nevulaThin.variable} antialiased`}
      >
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
