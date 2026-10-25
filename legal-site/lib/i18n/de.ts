// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Messages } from './types';

/** Prompt B string tables — DE column verbatim. */
export const de: Messages = {
  nav: {
    community: 'Community',
    privacy: 'Datenschutz',
    contribute: 'Unterstützen',
    delete: 'Daten löschen',
    imprint: 'Impressum',
  },
  footer: {
    community: 'Community',
    contribute: 'Unterstützen',
    privacy: 'Datenschutz',
    delete: 'Daten löschen',
    imprint: 'Impressum',
  },
  lang: { de: 'DE', en: 'EN' },
  brand: { subtitle: 'Privater Bereich für Android' },
  chrome: {
    mainAria: 'Hauptnavigation',
    footerAria: 'Fußnavigation',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
    morePagesAria: 'Weiterführende Seiten',
    rulesLink: 'Community-Regeln',
    playSoonAria: 'Bald im Play Store',
    lastUpdatedPrefix: 'Zuletzt aktualisiert:',
  },
  home: {
    heroTitle: 'Privater Android-Bereich',
    heroSub: 'ohne E-Mail, ohne Telefonnummer',
    heroBody:
      'Chats, Galerie und mehr in einem geschützten Raum. Auf Wunsch als Taschenrechner getarnt.',
    ctaInstall: 'Installieren / Zum Play Store',
    ctaPrivacy: 'Datenschutz lesen →',
    b1Title: 'Private Nachrichten',
    b1Body:
      'Chats sind mit NVL3 Ende-zu-Ende verschlüsselt — inkl. Post-Quantum-Schutz. Der Server sieht keinen Klartext. Burning (max. 28 Tage). Optional Tor pro Chat. Pairing von Angesicht zu Angesicht per QR oder per Einladungslink.',
    b2Title: 'Tarnung & Zugang',
    b2Body:
      'Icon als NEVULA oder Hidden Mode („Calculator“). Zugang hinter dem Taschenrechner-Gate mit Entriegelungs-PIN und getrenntem Zerstörungscode — beides nur auf dem Gerät.',
    b3Title: 'Geschützte Medien',
    b3Body:
      'Fotos und Videos importieren oder in der App aufnehmen. Metadaten werden entfernt, wo möglich. Geteilte Kopien laufen ab. Die private Galerie bleibt auf diesem Telefon.',
    b4Title: 'Privater Kalender & Notizen',
    b4Body:
      'Termine, Erinnerungen und Notizen bleiben auf dem Gerät — nicht als lesbare Cloud-Kopien. Lockscreen-Hinweise zeigen keine echten Titel oder Chat-Inhalte.',
    trust:
      'Wiederherstellung bringt nur die NEVULA-ID zurück — kein Backup von Chats, Kontakten, Galerie, Notizen oder Kalender. Kontakt-Einladungen per Link über nevula.de (widerrufbar). SOS/Emergency-Wipe löscht den lokalen Vault; das Online-Konto braucht die gesonderte Löschung. Details in der Privacy Policy.',
    securityTitle: 'Sicherheit von Anfang an',
    securityBody:
      'NEVULA wurde mit dem Anspruch entwickelt, private Kommunikation und persönliche Daten auf dem Smartphone nach hohen Sicherheits- und Datenschutzstandards zu schützen. Bei der Konzeption wurden bekannte Angriffsszenarien und reale Sicherheitsvorfälle moderner Kommunikationssysteme analysiert, um daraus zusätzliche Schutzmechanismen für NEVULA abzuleiten.',
    securityOpenSource:
      'NEVULA ist Open Source (AGPL-3.0). Jeder kann den Code auf GitHub einsehen.',
    securityAria: 'Sicherheit von Anfang an',
    contributeTitle: 'Unterstütze NEVULA',
    contributeBody:
      'Hilf uns, NEVULA unabhängig weiterzuentwickeln und Sicherheit, Infrastruktur und zukünftige Funktionen zu finanzieren.',
    contributeCta: 'NEVULA unterstützen',
    contributeAria: 'NEVULA unterstützen',
    ctaTitle: 'Dein privater Bereich startet hier.',
    ctaBody: 'NEVULA für Android — Android-first, ohne Werbung, ohne Verkauf von Nutzerdaten.',
    featuresAria: 'NEVULA Funktionen',
    trustAria: 'Vertrauen',
    install: 'Installieren',
  },
  community: {
    banner: 'NEVULA SPACE',
    intro:
      'Dein Platz für Fragen, Ideen und Austausch rund um NEVULA. Alle können mitlesen. Als Mitglied kannst du mitmachen.',
    login: 'Anmelden',
    createAccess: 'Zugang erstellen',
    hint: 'Beim ersten Mal über NEVULA → Einstellungen → Hilfe & Support öffnen. Danach mit Community-Name und Passwort anmelden.',
    empty: 'Noch keine öffentlichen Beiträge',
    emptyHint:
      'Das Board startet mit dem Internal Testing. Schau bald wieder vorbei — oder melde dich an, sobald dein Zugang aktiv ist.',
    catBugs: 'Bugs & Fehler',
    catQuestions: 'Community-Fragen',
    catIdeas: 'Ideen',
    catAnnouncement: 'Announcement',
    pinned: 'Pinned',
    draft: 'Entwurf',
    rulesLink: 'Community-Regeln',
    newPost: 'Eigenen Beitrag erstellen',
    access: 'Community-Zugang',
    supportHelp: 'Support / Hilfe',
    publicEyebrow: 'ÖFFENTLICHE BEITRÄGE',
    latestTitle: 'Neueste Beiträge',
    by: 'von',
    replies: 'Antworten',
    emptyNew: 'Ersten Beitrag erstellen',
    signedInAs: 'Angemeldet als',
    passwordUpdated:
      'Dein neues Community-Passwort ist gespeichert. Alle bisherigen Anmeldungen wurden beendet.',
    loginMissing:
      'Der Bestätigungslink ist unvollständig. Bitte öffne die Community erneut aus der App.',
    loginUnavailable: 'Dieser Community-Zugang ist nicht verfügbar.',
    loginExpired:
      'Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet. Bitte öffne die Community erneut aus der App.',
    officialNote:
      'Offizielle Antworten tragen immer die Kennzeichnung Official · NEVULA Team. Fehlt diese Markierung, ist es keine offizielle Antwort des Teams.',
    catBugCopy: 'Hier könnt ihr Fehler melden, die euch in der App auffallen.',
    catBugCta: 'Beitrag erstellen →',
    catQCopy: 'Hier könnt ihr Fragen stellen und anderen NEVULA-Nutzern helfen.',
    catQCta: 'Frage stellen →',
    catIdeaCopy: 'Hier könnt ihr Ideen und Wünsche für neue Funktionen teilen.',
    catIdeaCta: 'Vorschlag machen →',
    footerAria: 'Community-Links',
    loginToReply: 'Melde dich an, um zu antworten.',
    discussionLocked: 'Diese Diskussion ist gesperrt.',
    draftNoReplies: 'Entwürfe können noch keine öffentlichen Antworten erhalten.',
    notPublicYet: 'Diese Diskussion ist noch nicht öffentlich.',
  },
  login: {
    title: 'Willkommen zurück.',
    subtitle: 'Melde dich mit deinem Community-Namen und deinem eigenen Space-Passwort an.',
    noAccessTitle: 'Noch keinen Zugang?',
    noAccessBody:
      'Öffne in der entsperrten NEVULA-App Einstellungen → Hilfe & Support → Community. Danach wählst du hier deinen Namen und dein Passwort. Eine E-Mail-Adresse brauchst du dafür nicht.',
    submit: 'Anmelden',
    name: 'Community-Name',
    password: 'Passwort',
  },
  register: {
    title: 'Starte in deiner NEVULA-App.',
    body: 'Öffne den Space aus der entsperrten App unter Einstellungen → Hilfe & Support. Die Bestätigung gilt zehn Minuten — danach bist du hier willkommen.',
    haveAccess: 'Ich habe bereits einen Zugang',
    chooseNameTitle: 'Wie möchtest du heißen?',
    chooseNameBody:
      'Schön, dass du da bist. Wähle einen Community-Namen und ein eigenes Passwort — so kannst du dich später auch am Computer anmelden.',
    submit: 'Community-Zugang erstellen',
    nameHelp:
      'Dieser Name ist öffentlich und dient zur Anmeldung. 3–30 Zeichen: A–Z, Zahlen, Punkt, Unterstrich oder Bindestrich.',
    passwordHelp:
      '15–128 Zeichen. Verwende ein eigenes Passwort für den Space. Dein App-Code und deine privaten Schlüssel gehören nicht hierher.',
    confirmPassword: 'Passwort wiederholen',
  },
  password: {
    title: 'Name oder Passwort zurücksetzen',
    body: 'Aus Sicherheitsgründen fragen wir hier keine Recovery-Geheimnisse ab. Nutze den Weg in der entsperrten App unter Einstellungen → Hilfe & Support.',
    submit: 'Neues Passwort speichern',
  },
  rules: {
    title: 'Community-Regeln',
    intro:
      'Diese Regeln können sich ändern, wenn der Space wächst. Es gilt immer die aktuelle Fassung, wenn du postest oder antwortest.',
    updated: 'Zuletzt aktualisiert: 21. September 2026',
    back: '← Zurück zur Community',
    '1': {
      title: 'Respekt',
      body: 'Bleib respektvoll. Keine Belästigung, kein Hass, keine Drohungen oder persönlichen Angriffe. Streite über Ideen — nicht über Personen.',
    },
    '2': {
      title: 'Keine Geheimnisse, keine privaten Inhalte',
      body: 'Veröffentliche keine Geheimnisse, personenbezogenen Daten, Recovery-Keys, PINs, privaten Schlüssel oder Inhalte aus privaten Nachrichten. Die Community ist zum Mitlesen öffentlich.',
    },
    '3': {
      title: 'Sicherheitsvorschläge willkommen',
      body: 'Sicherheit hat Vorrang. Wir nehmen reale Fälle ernst und verbessern Maßnahmen laufend. Vorschläge, die NEVULA härten — Bugs, Angriffspfade, fehlende Schutzmaßnahmen — sind ausdrücklich willkommen.',
    },
    '4': {
      title: 'Offizielle Antworten',
      body: 'Offizielle Antworten tragen immer die Markierung Official · NEVULA Team. Fehlt diese Markierung, ist es keine offizielle Team-Antwort — auch wenn jemand etwas anderes behauptet.',
    },
    '5': {
      title: 'Änderungen',
      body: 'Regeln können aktualisiert werden. Wesentliche Änderungen erscheinen auf dieser Seite. Wer die Community nach einer Aktualisierung weiter nutzt, akzeptiert die geltenden Regeln.',
    },
  },
  contribute: {
    kicker: 'UNTERSTÜTZEN',
    title: 'NEVULA unterstützen',
    p1: 'NEVULA wird mit dem Ziel entwickelt, private und sichere digitale Kommunikation für jeden zugänglich zu machen. Entwicklung, Sicherheitsprüfungen, Infrastruktur und der kontinuierliche Betrieb verursachen jedoch laufende Kosten.',
    p2: 'Wenn du NEVULA und die weitere Entwicklung unterstützen möchtest, kannst du dies freiwillig mit einer Spende tun.',
    p3: 'Spenden helfen uns dabei, die Infrastruktur zu betreiben, Sicherheitsfunktionen weiterzuentwickeln, unabhängige Sicherheitsprüfungen zu finanzieren und NEVULA langfristig zu verbessern.',
    p4: 'Eine Spende ist selbstverständlich freiwillig und hat keinen Einfluss auf die Funktionen oder den Schutz, den du als NEVULA-Nutzer erhältst.',
    cryptoTitle: 'Spenden mit Bitcoin oder Monero',
    cryptoLead: 'Wir akzeptieren derzeit:',
    xmrTitle: 'Monero (XMR)',
    btcTitle: 'Bitcoin (BTC)',
    xmrQrAlt: 'QR-Code für die Monero-Spendenadresse',
    btcQrAlt: 'QR-Code für die Bitcoin-Spendenadresse',
    copyAddress: 'Adresse kopieren',
    copied: 'Kopiert',
    thanks: 'Vielen Dank an alle, die die Entwicklung von NEVULA unterstützen.',
  },
  support: {
    kicker: 'HILFE',
    title: 'Support',
    intro:
      'Hilfe zur Android-App. Nutze das Formular unten — sende keine Zugangscodes, Schlüssel oder privaten Chat-Inhalt.',
    updated: 'Zuletzt aktualisiert: 21. September 2026',
    beforeTitle: 'Bevor du schreibst',
    before1: 'Gerätemodell und App-Version',
    before2: 'Was du getippt hast und was erschien',
    before3:
      'Keine Calculator-PIN, Wipe-Codes, privaten Schlüssel, Nachrichtentext oder unbearbeitete Screenshots',
    commonTitle: 'Häufige Themen',
    issueDev:
      'Script lässt sich nicht laden — meist Development-Build. Bitte Standalone-/Store-Release nutzen.',
    issueWipe:
      'Lokale Daten weg — Emergency Wipe und lokale Löschung sind endgültig. Keine Wiederherstellung für Chats, Keys, Notes, Calendar oder Gallery.',
    issuePair:
      'Pairing scheitert — Kamera erlauben, aktuellen QR persönlich scannen, Angaben auf beiden Geräten bestätigen.',
    contactTitle: 'Kontakt',
    contactBody: 'Nachrichten gehen nur über dieses Formular an den Support-Posteingang.',
    warn: 'Bitte keine Zugangscodes, privaten Schlüssel oder Inhalte privater Chats senden.',
    name: 'Name',
    email: 'E-Mail',
    message: 'Nachricht',
    subject: 'Betreff',
    send: 'Senden',
    sendUnavailable: 'E-Mail-Versand ist vorübergehend nicht verfügbar.',
    sending: 'Wird gesendet …',
    success: 'Vielen Dank. Deine Nachricht wurde an den NEVULA Support gesendet.',
    hintRequired: 'Name, E-Mail und Nachricht (mind. 10 Zeichen) sind erforderlich.',
    hintShort: 'Die Nachricht muss mindestens 10 Zeichen haben.',
    subjects: ['Support-Anfrage', 'Bug oder Fehler', 'Datenschutz', 'Sonstiges'],
  },
  delete: {
    kicker: 'DATENKONTROLLE',
    title: 'Daten löschen',
    intro:
      'Dieses Telefon wischen und das Online-Konto löschen sind zwei verschiedene Schritte. Du kannst eines oder beides tun.',
    updated: 'Zuletzt aktualisiert: 21. September 2026',
    aTitle: 'A — Dieses Telefon wischen (lokal)',
    aBody:
      'Wenn die App gesperrt ist, erscheint wieder der Taschenrechner. Zerstörungscode eingeben und = drücken — Chats, Keys, Notes, Calendar und Gallery auf diesem Telefon werden sofort gelöscht (auch offline). Details: Datenschutz §2. Nach dem Entsperren: SOS oder Einstellungen → Kontolöschung / Emergency Kill. Lokales Wischen löscht nicht das Online-Konto — dafür Abschnitt B.',
    bTitle: 'B — Online-Konto löschen',
    bBody:
      'In der App: Einstellungen → Kontolöschung. External deletion code erzeugen und außerhalb des Telefons aufbewahren. Auf dieser Seite: NEVULA-ID und Personal Delete Key eingeben. Das entfernt das anonyme Online-Konto und verknüpfte Serverdaten. Gallery/Notes/Calendar auf dem Telefon nur über A.',
    formTitle: 'Online-Konto jetzt löschen',
    formLead:
      'Gib NEVULA-ID und Personal Delete Key ein. Das löscht dauerhaft das Online-Konto. Lokal wischen ist ein separater Schritt.',
    id: 'NEVULA-ID',
    key: 'Personal Delete Key',
    continue: 'Weiter zur endgültigen Bestätigung',
    confirmWarn:
      'Das löscht dauerhaft das Online-Konto. Lokal wischen ist ein separater Schritt.',
    confirmTitle: 'Bist du sicher?',
    confirmYes: 'Ja, Konto endgültig löschen',
    deleting: 'Wird gelöscht …',
    cancel: 'Abbrechen',
    help: 'Hilfe: Support-Formular. Nie Calculator-PIN, Zerstörungscode, private Keys oder Nachrichteninhalte senden.',
    remain:
      'Verschlüsselte Zustellpakete können bis zum Ablauf (≤ 28 Tage) bleiben, wenn sie nicht mehr zuordenbar sind.',
    hintBoth: 'Bitte NEVULA-ID und Personal Delete Key eingeben.',
    hintId: 'NEVULA-ID fehlt noch.',
    hintKey: 'Personal Delete Key fehlt noch.',
    hintNext: 'Als Nächstes erscheint eine zweite Bestätigung — die Löschung ist endgültig.',
    success: 'Dein NEVULA-Online-Konto und verknüpfte Serverdaten wurden gelöscht.',
    fail: 'Das Konto konnte nicht gelöscht werden.',
    unavailable: 'Der Löschdienst ist vorübergehend nicht erreichbar.',
  },
  imprint: {
    kicker: 'RECHTLICHES',
    title: 'Impressum',
    intro: 'Betreiber und Kontakt für die NEVULA-Android-App und diese Website.',
    updated: 'Zuletzt aktualisiert: 21. September 2026',
    serviceTitle: 'Angebot',
    serviceBody:
      'NEVULA ist ein privater Android-Bereich für verschlüsselte Nachrichten und lokale Werkzeuge.',
    contactTitle: 'Kontakt',
    email: 'E-Mail: nevula.support@proton.me',
    operatorTitle: 'Betreiber',
    operator: 'Denny Almeida\nRua das Violetas 11 – 2 Dto\n2870-296 Montijo, Portugal',
  },
  privacy: {
    kicker: 'RECHTLICHES',
    title: 'Datenschutz & Sicherheit',
    intro:
      'Alles, was dieser private Android-Bereich für Privatsphäre leisten kann — in klarer Sprache. Was auf dem Telefon bleibt, was online existieren darf, wie Löschung funktioniert und was Wiederherstellung leisten kann und was nicht.',
    designBody:
      'NEVULA wurde mit dem Anspruch entwickelt, private Kommunikation und persönliche Daten auf dem Smartphone nach hohen Sicherheits- und Datenschutzstandards zu schützen. Bei der Konzeption wurden bekannte Angriffsszenarien und reale Sicherheitsvorfälle moderner Kommunikationssysteme analysiert, um daraus zusätzliche Schutzmechanismen für NEVULA abzuleiten.',
    updated: '21. September 2026',
    tocLabel: 'Inhalt',
    tocAria: 'Inhaltsverzeichnis',
  },
  auth: {
    busy: 'Einen Moment …',
    forgot: 'Passwort oder Community-Name vergessen?',
    logout: 'Abmelden',
    loggingOut: 'Wird abgemeldet …',
    logoutFail: 'Abmelden fehlgeschlagen. Bitte erneut versuchen.',
    retry: 'Bitte versuche es erneut.',
    noAccessLink: 'Noch keinen Zugang?',
  },
};
