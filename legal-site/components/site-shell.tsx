'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import Image from 'next/image';
import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site-nav';
import { LangSwitcher } from '@/components/lang-switcher';
import { useI18n } from '@/components/i18n-provider';
import { NAV_HREFS } from '@/lib/i18n';

function protectBrandGlyphs(text: string) {
  return text.split('').join('\u200B');
}

export function BrandWord({
  children = 'NEVULA',
  join = false,
}: {
  children?: string;
  join?: boolean;
}) {
  return (
    <span
      className={`brandWord notranslate${join ? ' brandWordJoin' : ''}`}
      translate="no"
      lang="en"
      data-translate="no"
      aria-label={children}
    >
      {protectBrandGlyphs(children)}
    </span>
  );
}

export function BrandCompound({ suffix }: { suffix: string }) {
  return (
    <span className="brandCompound notranslate" translate="no" lang="en">
      <BrandWord join />-{suffix}
    </span>
  );
}

export function AuthMistMark() {
  return (
    <div className="authMist" aria-hidden="true">
      <div className="authMistWordmark">
        <BrandWord />
        <span className="authMistSub">PRIVATE MESSENGER</span>
      </div>
    </div>
  );
}

export function BrandHeadliner({
  children,
  priority = false,
  space = false,
  compact = false,
  title,
}: {
  children?: ReactNode;
  priority?: boolean;
  space?: boolean;
  compact?: boolean;
  title?: string;
}) {
  if (space) {
    return (
      <section className="productHero brandHero brandHeroSpaceArt">
        <h1 className="brandBanner brandBannerSpaceArt notranslate" translate="no">
          <Image
            src="/nevula-space-headliner.png"
            alt="NEVULA Space"
            width={1024}
            height={347}
            priority={priority}
            unoptimized
          />
        </h1>
        {children ? <div className="productHeroContent">{children}</div> : null}
      </section>
    );
  }

  return (
    <section
      className={`productHero brandHero brandHeroHome${compact ? ' brandHeroCompact' : ''}`}
    >
      <h1 className="brandBanner brandBannerWordmark">
        <span className="brandBannerCrop notranslate" translate="no">
          <span className="authMistWordmark authMistWordmarkHero">
            <BrandWord />
            <span className="authMistSub">PRIVATE MESSENGER</span>
          </span>
        </span>
        {title ? <span className="brandBannerTitle">{title}</span> : null}
      </h1>
      {children ? <div className="productHeroContent">{children}</div> : null}
    </section>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();

  return (
    <div className="site" lang={locale}>
      <header className="topbar">
        <a className="brand notranslate" href="/" translate="no">
          <Image src="/nevula-app-icon.png" alt="NEVULA" width={48} height={48} priority />
          <BrandWord />
        </a>
        <div className="topbarEnd">
          <LangSwitcher />
          <SiteNav />
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <span>
          <BrandWord /> · {t.brand.subtitle}
        </span>
        <nav aria-label={t.chrome.footerAria}>
          <a href="/community">{t.footer.community}</a>
          <a href="/support">{t.footer.contribute}</a>
          <a href="/privacy">{t.footer.privacy}</a>
          <a href="/delete">{t.footer.delete}</a>
          <a href="/imprint">{t.footer.imprint}</a>
          <a href="/community/rules">{t.chrome.rulesLink}</a>
        </nav>
      </footer>
    </div>
  );
}

export function DocumentPage({
  eyebrow,
  title,
  intro,
  introExtra,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  introExtra?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <SiteShell>
      <article className="document">
        <header>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lede">{intro}</p>
          {introExtra ? <p className="lede ledeExtra">{introExtra}</p> : null}
          {updated ? <p className="updated">{updated}</p> : null}
        </header>
        {children}
      </article>
    </SiteShell>
  );
}
