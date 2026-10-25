// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Messages } from './types';

/** Prompt B string tables — EN column verbatim. */
export const en: Messages = {
  nav: {
    community: 'Community',
    privacy: 'Privacy',
    contribute: 'Contribute',
    delete: 'Delete data',
    imprint: 'Imprint',
  },
  footer: {
    community: 'Community',
    contribute: 'Contribute',
    privacy: 'Privacy',
    delete: 'Delete data',
    imprint: 'Imprint',
  },
  lang: { de: 'DE', en: 'EN' },
  brand: { subtitle: 'Private Space for Android' },
  chrome: {
    mainAria: 'Main navigation',
    footerAria: 'Footer navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    morePagesAria: 'More pages',
    rulesLink: 'Community rules',
    playSoonAria: 'Coming soon on Play Store',
    lastUpdatedPrefix: 'Last updated:',
  },
  home: {
    heroTitle: 'Private Android space',
    heroSub: 'no email, no phone number',
    heroBody:
      'Chats, gallery and more in a protected space. Disguise as a calculator if you want.',
    ctaInstall: 'Install / Get it on Play Store',
    ctaPrivacy: 'Read Privacy →',
    b1Title: 'Private messages',
    b1Body:
      'Chats are end-to-end encrypted with NVL3 — including post-quantum protection. The server never sees plaintext. Burning (max 28 days). Optional Tor per chat. Pairing in person via QR or by invite link.',
    b2Title: 'Disguise & access',
    b2Body:
      'Icon as NEVULA or Hidden Mode (“Calculator”). Access behind the calculator gate with an entry PIN and a separate destruction code — both on-device only.',
    b3Title: 'Protected media',
    b3Body:
      'Import photos and videos or capture in-app. Metadata is stripped where possible. Shared copies expire. Your private Gallery stays on this phone.',
    b4Title: 'Private calendar & notes',
    b4Body:
      'Appointments, reminders and notes stay on the device — not as readable cloud copies. Lock-screen alerts never show real titles or chat content.',
    trust:
      'Recovery restores only your NEVULA ID — no backup of chats, contacts, Gallery, Notes or Calendar. Contact invites via link on nevula.de (revocable). SOS/Emergency wipe erases the local vault; the online account needs separate deletion. Details in the Privacy Policy.',
    securityTitle: 'Security by design',
    securityBody:
      'NEVULA was developed to protect private communication and personal data on the smartphone to high security and privacy standards. During its design, known attack scenarios and real-world security incidents affecting modern communication systems were analyzed, in order to derive additional protective mechanisms for NEVULA.',
    securityOpenSource:
      'NEVULA is open source (AGPL-3.0). Anyone can inspect the code on GitHub.',
    securityAria: 'Security by design',
    contributeTitle: 'Support NEVULA',
    contributeBody:
      'Help us keep NEVULA independent and fund security, infrastructure, and future features.',
    contributeCta: 'Support NEVULA',
    contributeAria: 'Support NEVULA',
    ctaTitle: 'Your private space starts here.',
    ctaBody: 'NEVULA for Android — Android-first, no ads, no selling of user data.',
    featuresAria: 'NEVULA features',
    trustAria: 'Trust',
    install: 'Install',
  },
  community: {
    banner: 'NEVULA SPACE',
    intro:
      'Your place for questions, ideas and discussion about NEVULA. Anyone can read. Members can take part.',
    login: 'Log in',
    createAccess: 'Create access',
    hint: 'First time: in unlocked NEVULA open Settings → Help & Support. Then sign in here with your community name and password.',
    empty: 'No public posts yet',
    emptyHint:
      'The board opens with internal testing. Check back soon — or log in once your access is active.',
    catBugs: 'Bugs & issues',
    catQuestions: 'Community questions',
    catIdeas: 'Ideas',
    catAnnouncement: 'Announcement',
    pinned: 'Pinned',
    draft: 'Draft',
    rulesLink: 'Community rules',
    newPost: 'Create a post',
    access: 'Community access',
    supportHelp: 'Support / Help',
    publicEyebrow: 'PUBLIC POSTS',
    latestTitle: 'Latest posts',
    by: 'by',
    replies: 'replies',
    emptyNew: 'Create first post',
    signedInAs: 'Signed in as',
    passwordUpdated: 'Your new Community password is saved. All previous sessions were ended.',
    loginMissing: 'The confirmation link is incomplete. Please open Community again from the app.',
    loginUnavailable: 'This Community access is unavailable.',
    loginExpired:
      'The confirmation link has expired or was already used. Please open Community again from the app.',
    officialNote:
      'Official replies always carry the mark Official · NEVULA Team. If that mark is missing, it is not an official team answer.',
    catBugCopy: 'Report issues you notice in the app.',
    catBugCta: 'Create post →',
    catQCopy: 'Ask questions and help other NEVULA users.',
    catQCta: 'Ask a question →',
    catIdeaCopy: 'Share ideas and wishes for new features.',
    catIdeaCta: 'Suggest →',
    footerAria: 'Community links',
    loginToReply: 'Log in to reply.',
    discussionLocked: 'This discussion is locked.',
    draftNoReplies: 'Drafts cannot receive public replies yet.',
    notPublicYet: 'This discussion is not public yet.',
  },
  login: {
    title: 'Welcome back.',
    subtitle: 'Sign in with your community name and Space password.',
    noAccessTitle: 'No access yet?',
    noAccessBody:
      'In the unlocked NEVULA app open Settings → Help & Support → Community. Then choose your name and password here. You do not need an email address.',
    submit: 'Log in',
    name: 'Community name',
    password: 'Password',
  },
  register: {
    title: 'Start in your NEVULA app.',
    body: 'Open the Space from the unlocked app under Settings → Help & Support. Confirmation is valid for ten minutes — then you are welcome here.',
    haveAccess: 'I already have access',
    chooseNameTitle: 'What should we call you?',
    chooseNameBody:
      'Glad you are here. Choose a Community name and your own password — then you can also sign in on a computer later.',
    submit: 'Create Community access',
    nameHelp:
      'This name is public and used to sign in. 3–30 characters: A–Z, numbers, period, underscore or hyphen.',
    passwordHelp:
      '15–128 characters. Use a dedicated Space password. Your app code and private keys do not belong here.',
    confirmPassword: 'Repeat password',
  },
  password: {
    title: 'Reset name or password',
    body: 'For security we do not ask for recovery secrets here. Use the path in the unlocked app under Settings → Help & Support.',
    submit: 'Save new password',
  },
  rules: {
    title: 'Community rules',
    intro:
      'These rules can change over time as the Space grows. The current version always applies when you post or reply.',
    updated: 'Last updated: 21 September 2026',
    back: '← Back to Community',
    '1': {
      title: 'Respect',
      body: 'Stay respectful. No harassment, hate, threats or personal attacks. Argue about ideas — not about people.',
    },
    '2': {
      title: 'No secrets, no private content',
      body: 'Do not publish secrets, personal data, recovery keys, PINs, private keys, or content from private messages. The Community is public for reading.',
    },
    '3': {
      title: 'Security suggestions welcome',
      body: 'Security comes first. We take real-world cases seriously and improve measures over time. Suggestions that harden NEVULA — bugs, attack paths, missing protections — are expressly welcome here.',
    },
    '4': {
      title: 'Official answers',
      body: 'Official replies always carry the mark Official · NEVULA Team. If that mark is missing, it is not an official team answer — even if someone claims otherwise.',
    },
    '5': {
      title: 'Changes',
      body: 'Rules may be updated. Significant changes will be reflected on this page. Continued use of the Community after an update means you accept the current rules.',
    },
  },
  contribute: {
    kicker: 'CONTRIBUTE',
    title: 'Support NEVULA',
    p1: 'NEVULA is built to make private, secure digital communication available to everyone. Development, security reviews, infrastructure, and ongoing operations still create continuous costs.',
    p2: 'If you want to support NEVULA and its further development, you can do so voluntarily with a donation.',
    p3: 'Donations help us run infrastructure, improve security features, fund independent security reviews, and keep improving NEVULA over the long term.',
    p4: 'A donation is entirely voluntary and does not affect the features or protections you receive as a NEVULA user.',
    cryptoTitle: 'Donate with Bitcoin or Monero',
    cryptoLead: 'We currently accept:',
    xmrTitle: 'Monero (XMR)',
    btcTitle: 'Bitcoin (BTC)',
    xmrQrAlt: 'QR code for the Monero donation address',
    btcQrAlt: 'QR code for the Bitcoin donation address',
    copyAddress: 'Copy address',
    copied: 'Copied',
    thanks: 'Thank you to everyone who supports the development of NEVULA.',
  },
  support: {
    kicker: 'HELP',
    title: 'Support',
    intro:
      'Help with the Android app. Use the form below — do not send access codes, keys or private chat content.',
    updated: 'Last updated: 21 September 2026',
    beforeTitle: 'Before you write',
    before1: 'Device model and app version',
    before2: 'What you tapped and what appeared',
    before3:
      'No calculator PIN, wipe codes, private keys, message text or unredacted screenshots',
    commonTitle: 'Common issues',
    issueDev:
      'Unable to load script — usually a development build. Install the standalone store release.',
    issueWipe:
      'Local data is gone — emergency wipe and local erasure are irreversible. There is no recovery for chats, keys, notes, calendar or gallery files.',
    issuePair:
      'Pairing fails — allow camera access, scan the current QR in person and confirm the details shown on both devices.',
    contactTitle: 'Contact',
    contactBody: 'Messages go to the support inbox through this form only.',
    warn: 'Please do not send access codes, private keys or private chat content.',
    name: 'Name',
    email: 'Email',
    message: 'Message',
    subject: 'Subject',
    send: 'Send',
    sendUnavailable: 'Email sending is temporarily unavailable.',
    sending: 'Sending…',
    success: 'Thank you. Your message was sent to NEVULA Support.',
    hintRequired: 'Name, email and message (min. 10 characters) are required.',
    hintShort: 'The message must be at least 10 characters.',
    subjects: ['Support request', 'Bug or error', 'Privacy', 'Other'],
  },
  delete: {
    kicker: 'DATA CONTROL',
    title: 'Data deletion',
    intro:
      'Wiping this phone and deleting the online account are two different steps. You can do either, or both.',
    updated: 'Last updated: 21 September 2026',
    aTitle: 'A — Wipe this phone (local)',
    aBody:
      'When you open the locked app, the calculator appears again. Enter your destruction PIN and press = — that erases chats, keys, Notes, Calendar and Gallery on that phone immediately (also works offline). Details: Privacy §2. After unlock you can also use Emergency Kill, or Settings → Account deletion. Local wipe does not remove the online account by itself — use section B.',
    bTitle: 'B — Delete the online account',
    bBody:
      'In the app: Settings → Account deletion. Generate an external deletion code and keep it outside the phone. On this page: enter your NEVULA ID and Personal Delete Key. This deletes the anonymous online account and linked server records. Gallery, Notes and Calendar on the phone only via A.',
    formTitle: 'Delete your online account now',
    formLead:
      'Enter your NEVULA ID and Personal Delete Key. This permanently deletes the online account. Local wipe is a separate step.',
    id: 'NEVULA ID',
    key: 'Personal Delete Key',
    continue: 'Continue to final confirmation',
    confirmWarn:
      'This permanently deletes the online account. Local wipe is a separate step.',
    confirmTitle: 'Are you sure?',
    confirmYes: 'Yes, permanently delete my account',
    deleting: 'Deleting…',
    cancel: 'Cancel',
    help: 'Need help? Use the support form. Never send calculator PIN, destruction PIN, private keys or message contents.',
    remain:
      'Locked delivery packages may stay encrypted until they expire (≤ 28 days) if they can no longer be tied to you.',
    hintBoth: 'Please enter your NEVULA ID and Personal Delete Key.',
    hintId: 'NEVULA ID is still missing.',
    hintKey: 'Personal Delete Key is still missing.',
    hintNext: 'Next you will see a second confirmation — deletion is permanent.',
    success: 'Your NEVULA online account and linked server data have been deleted.',
    fail: 'The account could not be deleted.',
    unavailable: 'The deletion service is temporarily unavailable.',
  },
  imprint: {
    kicker: 'LEGAL',
    title: 'Imprint',
    intro: 'Operator and contact information for the NEVULA Android app and this website.',
    updated: 'Last updated: 21 September 2026',
    serviceTitle: 'Service',
    serviceBody: 'NEVULA is a private Android space for encrypted messaging and local tools.',
    contactTitle: 'Contact',
    email: 'Email: nevula.support@proton.me',
    operatorTitle: 'Operator',
    operator: 'Denny Almeida\nRua das Violetas 11 – 2 Dto\n2870-296 Montijo, Portugal',
  },
  privacy: {
    kicker: 'LEGAL',
    title: 'Privacy & Security',
    intro:
      'Everything this private Android space can do for privacy — explained in plain language. What stays on your phone, what may exist online, how deletion works, and what recovery can and cannot restore.',
    designBody:
      'NEVULA was developed to protect private communication and personal data on the smartphone to high security and privacy standards. During its design, known attack scenarios and real-world security incidents affecting modern communication systems were analyzed, in order to derive additional protective mechanisms for NEVULA.',
    updated: '21 September 2026',
    tocLabel: 'Contents',
    tocAria: 'Table of contents',
  },
  auth: {
    busy: 'One moment…',
    forgot: 'Forgot password or Community name?',
    logout: 'Sign out',
    loggingOut: 'Signing out…',
    logoutFail: 'Sign-out failed. Please try again.',
    retry: 'Please try again.',
    noAccessLink: 'No access yet?',
  },
};
