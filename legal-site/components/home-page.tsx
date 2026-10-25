'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import {
  CalendarDays,
  Camera,
  LockKeyhole,
  MessagesSquare,
} from 'lucide-react';
import Image from 'next/image';
import { SiteShell } from '@/components/site-shell';
import { useI18n } from '@/components/i18n-provider';

const PLAY_STORE_PUBLIC = true;
const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.nevula.app';

function GooglePlayMark() {
  return (
    <svg className="googlePlayMark" viewBox="0 0 32 36" role="img" aria-hidden="true">
      <path
        fill="#00d7fe"
        d="M1.8 1.4 18.7 18 1.8 34.6A4 4 0 0 1 1 32.1V3.9a4 4 0 0 1 .8-2.5Z"
      />
      <path
        fill="#ffce00"
        d="m18.7 18 4.8-4.7 6 3.4c1.8 1 1.8 1.6 0 2.6l-6 3.4-4.8-4.7Z"
      />
      <path
        fill="#ff3a44"
        d="m18.7 18 4.8 4.7L4.3 35.4a4 4 0 0 1-2.5-.8L18.7 18Z"
      />
      <path
        fill="#00f076"
        d="M4.3.6 23.5 13.3 18.7 18 1.8 1.4A4 4 0 0 1 4.3.6Z"
      />
    </svg>
  );
}

function StoreIconLink({ label }: { label: string }) {
  const icon = (
    <Image src="/nevula-store-icon.png" alt="" width={112} height={112} unoptimized />
  );
  if (!PLAY_STORE_PUBLIC) {
    return (
      <span className="storeIconLink" aria-label={label}>
        {icon}
      </span>
    );
  }
  return (
    <a className="storeIconLink" href={playStoreUrl} target="_blank" rel="noreferrer" aria-label={label}>
      {icon}
    </a>
  );
}

function PlayCta({
  className,
  label,
  soonAria,
}: {
  className: string;
  label: string;
  soonAria: string;
}) {
  if (!PLAY_STORE_PUBLIC) {
    return (
      <span className={`${className} playButtonSoon btnPrimary`} aria-label={soonAria}>
        <GooglePlayMark />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <a className={`${className} btnPrimary`} href={playStoreUrl} target="_blank" rel="noreferrer">
      <GooglePlayMark />
      <span>{label}</span>
    </a>
  );
}

function TrustWithPrivacyLink({ text }: { text: string }) {
  const marker = 'Privacy Policy';
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <a href="/privacy">{marker}</a>
      {text.slice(idx + marker.length)}
    </>
  );
}

function OpenSourceWithGitHubLink({ text }: { text: string }) {
  const marker = 'GitHub';
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <a href="https://github.com/nevula-app/nevula-app" target="_blank" rel="noreferrer">
        {marker}
      </a>
      {text.slice(idx + marker.length)}
    </>
  );
}

export default function HomePage() {
  const { t, locale } = useI18n();
  const features = [
    { title: t.home.b1Title, copy: t.home.b1Body, icon: MessagesSquare },
    { title: t.home.b2Title, copy: t.home.b2Body, icon: LockKeyhole },
    { title: t.home.b3Title, copy: t.home.b3Body, icon: Camera },
    { title: t.home.b4Title, copy: t.home.b4Body, icon: CalendarDays },
  ];

  return (
    <SiteShell>
      <div lang={locale}>
        <section className="productHero brandHero">
          <h1 style={{ margin: 0, width: '100%', lineHeight: 0 }}>
            <Image
              src="/nevula-feature-graphic-1024x500.png"
              alt="NEVULA — PRIVATE MESSENGER"
              width={1024}
              height={500}
              priority
              unoptimized
              style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }}
            />
          </h1>
          <div className="productHeroContent">
          <div className="heroActions">
            <PlayCta
              className="miniPlayButton"
              label={t.home.ctaInstall}
              soonAria={t.chrome.playSoonAria}
            />
            <a className="heroPrivacyLink btnSecondaryText" href="/privacy">
              {t.home.ctaPrivacy}
            </a>
          </div>
          </div>
        </section>

        <section className="securityByDesign" aria-label={t.home.securityAria}>
          <h2>{t.home.securityTitle}</h2>
          <p>{t.home.securityBody}</p>
          <p>
            <OpenSourceWithGitHubLink text={t.home.securityOpenSource} />
          </p>
        </section>

        <section className="featureGrid" aria-label={t.home.featuresAria}>
          {features.map(({ title, copy, icon: Icon }) => (
            <article className="featureCard" key={title}>
              <Icon size={22} />
              <h3>{title}</h3>
              {copy.split('\n\n').map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </section>

        <section className="trustStrip" aria-label={t.home.trustAria}>
          <p>
            <TrustWithPrivacyLink text={t.home.trust} />
          </p>
        </section>

        <section className="contributeTeaser" aria-label={t.home.contributeAria}>
          <h2>{t.home.contributeTitle}</h2>
          <p>{t.home.contributeBody}</p>
          <a className="contributeTeaserCta btnSecondary" href="/support">
            {t.home.contributeCta}
          </a>
        </section>

        <section className="downloadBand">
          <div>
            <h2>{t.home.ctaTitle}</h2>
            <p>{t.home.ctaBody}</p>
          </div>
          <div className="downloadActions">
            <StoreIconLink label={t.home.ctaInstall} />
            <PlayCta
              className="playButton"
              label={t.home.install}
              soonAria={t.chrome.playSoonAria}
            />
          </div>
        </section>

        <nav className="homeFooterLinks" aria-label={t.chrome.morePagesAria}>
          <a href="/community">{t.footer.community}</a>
          <a href="/support">{t.footer.contribute}</a>
          <a href="/privacy">{t.footer.privacy}</a>
          <a href="/delete">{t.footer.delete}</a>
          <a href="/imprint">{t.footer.imprint}</a>
        </nav>
      </div>
    </SiteShell>
  );
}
