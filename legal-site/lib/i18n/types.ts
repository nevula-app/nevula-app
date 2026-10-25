// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export type Locale = 'de' | 'en';

export const LOCALES: Locale[] = ['de', 'en'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LANG_STORAGE_KEY = 'nevula.lang';

export const NAV_HREFS = [
  { href: '/community', key: 'community' as const },
  { href: '/privacy', key: 'privacy' as const },
  { href: '/support', key: 'contribute' as const },
  { href: '/delete', key: 'delete' as const },
  { href: '/imprint', key: 'imprint' as const },
];

/** Flat string bag matching Prompt B keys (dot paths as nested objects). */
export type Messages = {
  nav: {
    community: string;
    privacy: string;
    contribute: string;
    delete: string;
    imprint: string;
  };
  footer: {
    community: string;
    contribute: string;
    privacy: string;
    delete: string;
    imprint: string;
  };
  lang: { de: string; en: string };
  brand: { subtitle: string };
  chrome: {
    mainAria: string;
    footerAria: string;
    openMenu: string;
    closeMenu: string;
    morePagesAria: string;
    rulesLink: string;
    playSoonAria: string;
    lastUpdatedPrefix: string;
  };
  home: {
    heroTitle: string;
    heroSub: string;
    heroBody: string;
    ctaInstall: string;
    ctaPrivacy: string;
    b1Title: string;
    b1Body: string;
    b2Title: string;
    b2Body: string;
    b3Title: string;
    b3Body: string;
    b4Title: string;
    b4Body: string;
    trust: string;
    securityTitle: string;
    securityBody: string;
    securityOpenSource: string;
    securityAria: string;
    contributeTitle: string;
    contributeBody: string;
    contributeCta: string;
    contributeAria: string;
    ctaTitle: string;
    ctaBody: string;
    featuresAria: string;
    trustAria: string;
    install: string;
  };
  community: {
    banner: string;
    intro: string;
    login: string;
    createAccess: string;
    hint: string;
    empty: string;
    emptyHint: string;
    catBugs: string;
    catQuestions: string;
    catIdeas: string;
    catAnnouncement: string;
    pinned: string;
    draft: string;
    rulesLink: string;
    newPost: string;
    access: string;
    supportHelp: string;
    publicEyebrow: string;
    latestTitle: string;
    by: string;
    replies: string;
    emptyNew: string;
    signedInAs: string;
    passwordUpdated: string;
    loginMissing: string;
    loginUnavailable: string;
    loginExpired: string;
    officialNote: string;
    catBugCopy: string;
    catBugCta: string;
    catQCopy: string;
    catQCta: string;
    catIdeaCopy: string;
    catIdeaCta: string;
    footerAria: string;
    loginToReply: string;
    discussionLocked: string;
    draftNoReplies: string;
    notPublicYet: string;
  };
  login: {
    title: string;
    subtitle: string;
    noAccessTitle: string;
    noAccessBody: string;
    submit: string;
    name: string;
    password: string;
  };
  register: {
    title: string;
    body: string;
    haveAccess: string;
    chooseNameTitle: string;
    chooseNameBody: string;
    submit: string;
    nameHelp: string;
    passwordHelp: string;
    confirmPassword: string;
  };
  password: {
    title: string;
    body: string;
    submit: string;
  };
  rules: {
    title: string;
    intro: string;
    updated: string;
    back: string;
    '1': { title: string; body: string };
    '2': { title: string; body: string };
    '3': { title: string; body: string };
    '4': { title: string; body: string };
    '5': { title: string; body: string };
  };
  contribute: {
    kicker: string;
    title: string;
    p1: string;
    p2: string;
    p3: string;
    p4: string;
    cryptoTitle: string;
    cryptoLead: string;
    xmrTitle: string;
    btcTitle: string;
    xmrQrAlt: string;
    btcQrAlt: string;
    copyAddress: string;
    copied: string;
    thanks: string;
  };
  support: {
    kicker: string;
    title: string;
    intro: string;
    updated: string;
    beforeTitle: string;
    before1: string;
    before2: string;
    before3: string;
    commonTitle: string;
    issueDev: string;
    issueWipe: string;
    issuePair: string;
    contactTitle: string;
    contactBody: string;
    warn: string;
    name: string;
    email: string;
    message: string;
    subject: string;
    send: string;
    sendUnavailable: string;
    sending: string;
    success: string;
    hintRequired: string;
    hintShort: string;
    subjects: [string, string, string, string];
  };
  delete: {
    kicker: string;
    title: string;
    intro: string;
    updated: string;
    aTitle: string;
    aBody: string;
    bTitle: string;
    bBody: string;
    formTitle: string;
    formLead: string;
    id: string;
    key: string;
    continue: string;
    confirmWarn: string;
    confirmTitle: string;
    confirmYes: string;
    deleting: string;
    cancel: string;
    help: string;
    remain: string;
    hintBoth: string;
    hintId: string;
    hintKey: string;
    hintNext: string;
    success: string;
    fail: string;
    unavailable: string;
  };
  imprint: {
    kicker: string;
    title: string;
    intro: string;
    updated: string;
    serviceTitle: string;
    serviceBody: string;
    contactTitle: string;
    email: string;
    operatorTitle: string;
    operator: string;
  };
  privacy: {
    kicker: string;
    title: string;
    intro: string;
    designBody: string;
    updated: string;
    tocLabel: string;
    tocAria: string;
  };
  auth: {
    busy: string;
    forgot: string;
    logout: string;
    loggingOut: string;
    logoutFail: string;
    retry: string;
    noAccessLink: string;
  };
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'de' || value === 'en';
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const raw = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

export function localeFromSearch(search: string): Locale | null {
  try {
    const lang = new URLSearchParams(search).get('lang');
    return isLocale(lang) ? lang : null;
  } catch {
    return null;
  }
}
