// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/** de.privacy Volltext — Prompt B, verbatim sections. */

export type PrivacyBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'phtml'; html: 'support' | 'community' | 'delete' | 'gate' };

export type PrivacySection = {
  id: string;
  title: string;
  blocks: PrivacyBlock[];
};

export const privacyDeToc = [
  { id: 'was-ist', label: '1. Was NEVULA ist' },
  { id: 'calculator-gate', label: '2. Taschenrechner-Gate' },
  { id: 'erscheinung', label: '3. Dezente Darstellung' },
  { id: 'auf-dem-telefon', label: '4. Was auf dem Telefon bleibt' },
  { id: 'nvl3', label: '5. Gesperrte Chats — NVL3' },
  { id: 'sprachnotizen', label: '6. Sprachnachrichten' },
  { id: 'galerie-notizen-kalender', label: '7. Galerie, Notizen und Kalender' },
  { id: 'online', label: '8. Was online existieren darf' },
  { id: 'tor', label: '9. Optional Tor (NevTOR)' },
  { id: 'benachrichtigungen', label: '10. Dezente Benachrichtigungen' },
  { id: 'wiederherstellung', label: '11. Wiederherstellung' },
  { id: 'einladungen', label: '12. Öffentliche Kontakt-Einladungen' },
  { id: 'community', label: '13. Community auf dieser Website' },
  { id: 'loeschung', label: '14. Löschung — auf dem Telefon und online' },
  { id: 'berechtigungen', label: '15. Telefon-Berechtigungen' },
  { id: 'anbieter', label: '16. Anbieter und Werbung' },
  { id: 'sicherheit', label: '17. Kontinuierliche Sicherheit' },
  { id: 'kontakt', label: '18. Kontakt' },
  { id: 'verantwortlich', label: '19. Verantwortliche Stelle' },
] as const;

export const privacyDeSections: PrivacySection[] = [
  {
    id: 'was-ist',
    title: '1. Was NEVULA ist',
    blocks: [
      {
        type: 'p',
        text: 'NEVULA ist ein privater Android-Bereich. Du kannst ihn als NEVULA öffnen oder als Taschenrechner verbergen (Hidden Mode). Darin gibt es verschlüsselte Nachrichten, neu gesprochene Sprachnachrichten, Notizen, Kalender, eine private Galerie (mit Kamera), optional Tor (NevTOR mit Orbot), öffentliche Kontakt-Einladungen und eine Mitglieder-Community auf dieser Website. Für die App-Identität brauchst du weder E-Mail-Adresse noch Telefonnummer.',
      },
    ],
  },
  {
    id: 'calculator-gate',
    title: '2. Taschenrechner-Gate — Entriegelungs-PIN und Zerstörungscode',
    blocks: [
      {
        type: 'p',
        text: 'Der private Bereich liegt hinter einer Taschenrechner-Oberfläche. Wenn du die gesperrte App öffnest, siehst du diesen Taschenrechner erneut, gibst einen Code ein und bestätigst mit =. Bei der Einrichtung von NEVULA wählst du:',
      },
      {
        type: 'ul',
        items: [
          'Entriegelungs-PIN — entsperrt deinen privaten Bereich.',
          'Zerstörungscode — ein separater Code. Wenn jemand ihn auf dem Taschenrechner-Cover eingibt und mit = bestätigt, wird der private Bereich auf diesem Telefon sofort gelöscht.',
        ],
      },
      {
        type: 'p',
        text: 'Beide Codes bleiben auf dem Gerät. Sie werden nicht an unsere Server gesendet. Du entscheidest in dem Moment: entsperren oder zerstören. Später änderbar unter Einstellungen → Zugang (Taschenrechner-PIN und Notfall-Löschung).',
      },
      {
        type: 'p',
        text: 'Zerstörungscode und Emergency Kill laufen nur auf diesem Telefon. Dafür brauchst du keine Serververbindung. Die Löschung des Online-Kontos ist ein eigener Schritt und braucht das Netz.',
      },
      {
        type: 'p',
        text: 'Innerhalb der entsperrten App kannst du auch Emergency Kill auslösen — über die rote SOS-Steuerung auf dem Startbildschirm oder unter Einstellungen → Kontolöschung (nach Bestätigung der Entriegelungs-PIN). Das löscht den privaten Vault auf diesem Telefon. Es löscht nicht von allein dein Online-Konto — siehe Abschnitt 14.',
      },
      {
        type: 'p',
        text: 'Wiederholt falsche PIN-Eingaben führen zu vorübergehenden Sperren und nach weiteren Fehlversuchen zu einer automatischen lokalen Löschung des privaten Bereichs auf diesem Gerät.',
      },
      {
        type: 'p',
        text: 'Nach erfolgreicher Entriegelung kannst du „Entsperrt bleiben“ für eine begrenzte Zeit wählen (von 10 Minuten bis 3 Stunden). In diesem Fenster kann der private Bereich ohne Taschenrechner-PIN erneut geöffnet werden — auch wenn du die App verlässt und zurückkommst. Die Wahl bleibt nur auf diesem Telefon. Wenn das Fenster endet, erscheint wieder das Taschenrechner-Gate.',
      },
    ],
  },
  {
    id: 'erscheinung',
    title: '3. Dezente Darstellung',
    blocks: [
      {
        type: 'p',
        text: 'Du kannst das NEVULA-Icon und den Namen auf dem Startbildschirm zeigen oder Hidden Mode wählen: ein neutrales Taschenrechner-Icon und die Bezeichnung „Calculator“, sodass die App wie ein normales Taschenrechner-Werkzeug wirkt. Das Hidden-Mode-Icon enthält kein NEVULA-„N“. Diese Wahl bleibt auf dem Telefon und ändert weder Verschlüsselung noch deine PINs noch deine gespeicherten privaten Inhalte.',
      },
    ],
  },
  {
    id: 'auf-dem-telefon',
    title: '4. Was auf dem Telefon bleibt',
    blocks: [
      {
        type: 'p',
        text: 'Folgendes soll auf dem Gerät bleiben (app-privat / sicherer Speicher), nicht als lesbare Cloud-Inhalte:',
      },
      {
        type: 'ul',
        items: [
          'Notizen, Kalendertermine, Galerie-Fotos/Videos/Dateien',
          'Lokale Kontakte, Chat-Bezeichnungen und lokale Chatlisten-Metadaten',
          'Verschlüsselungsschlüssel und sichere Sitzungen',
          'Entriegelungs-PIN, Zerstörungscode, Tor- und Chat-Einstellungen',
          'Benachrichtigungseinstellungen und Launcher-Darstellung',
        ],
      },
      {
        type: 'p',
        text: 'Wo unterstützt, werden zusätzliche Foto-/Video-Dateiinfos (z. B. Standort oder Geräte-Tags) vor Galerie-Speicherung oder Versand entfernt.',
      },
    ],
  },
  {
    id: 'nvl3',
    title: '5. Gesperrte Chats — NVL3-Verschlüsselung',
    blocks: [
      {
        type: 'p',
        text: 'Nachrichtentext, Anhänge und Sprachnachrichten werden auf dem Telefon gesperrt, bevor sie gesendet werden. Die Zustellung speichert gesperrte Pakete. Wir sollen deinen Chat-Inhalt vom Server nicht lesen können.',
      },
      {
        type: 'p',
        text: 'Neue Chats nutzen NVL3: einen Double Ratchet mit per-message keys auf diesem Gerät (in der App als NVL3 ACTIVE). Schlüssel rotieren während des Gesprächs. Ältere Paketformate sind nur Legacy-Lesepfade — nicht der Weg, wie neue Nachrichten geschrieben werden.',
      },
      {
        type: 'p',
        text: 'Post-Quantum-Schicht (zusätzlich): NVL3 nutzt zusätzlich einen quantenresistenten Schlüsselaustausch. Diese Hochsicherheitsmaßnahme richtet sich gegen Harvest Now, Decrypt Later — Gegner, die verschlüsselten Verkehr jetzt archivieren und auf künftige Quantencomputer warten. Auch dann sollen diese Archive nutzlos bleiben. Post-Quantum ersetzt die Ende-zu-Ende-Verschlüsselung nicht; es härtet die Schlüssel, von denen sie abhängt.',
      },
      {
        type: 'p',
        text: 'Das Pairing mit einem Kontakt nutzt QR von Angesicht zu Angesicht (oder einen entschlüsselten Einladungsweg) — kein öffentliches durchsuchbares Verzeichnis aller Identitäten. Dieses QR-Pairing ist getrennt von der NVL3-Verschlüsselung und von optionalem Tor.',
      },
      {
        type: 'p',
        text: 'Messaging ist standardmäßig Eins-zu-eins. Du kannst Kontakte in einen bestehenden Chat einladen (Invite in der Unterhaltung) und so eine kleine Gruppe bilden. Dieselben Sperr- und Burning-Regeln gelten.',
      },
      {
        type: 'p',
        text: 'Burning: Nachrichten laufen immer ab. Du wählst die Dauer (Minuten, Stunden oder Tage), bis zu einem harten Maximum von 28 Tagen. Auf dem Server bleiben Zustellkopien verschlüsselt — nicht als lesbarer Chat-Text — und werden automatisch gelöscht, wenn sie ablaufen (typischerweise auch nach dem Abholen). Viele Dienste behalten Verlauf unbegrenzt; hier wird alles absichtlich entfernt.',
      },
    ],
  },
  {
    id: 'sprachnotizen',
    title: '6. Sprachnachrichten',
    blocks: [
      {
        type: 'p',
        text: 'Sprachnachrichten sind keine getarnte Aufnahme deiner Stimme. Auf dem Telefon werden gesprochene Worte verstanden und danach mit einer synthetischen Stimme neu gesprochen (z. B. Robot / Chatter / Synthetic). Nur dieses neu gesprochene Audio wird gesperrt und gesendet. Die Original-Mikrofonaufnahme wird auf dem Gerät verworfen und nicht zur Zustellung aufbewahrt — aus der Sprachnachricht führt kein Weg zurück zu deiner echten Stimme. Burning-Regeln wie bei anderen Nachrichten.',
      },
    ],
  },
  {
    id: 'galerie-notizen-kalender',
    title: '7. Galerie, Notizen und Kalender',
    blocks: [
      {
        type: 'p',
        text: 'Galerie — private Fotos, Videos und Dateien bleiben verschlüsselt auf dem Gerät. Sie werden nicht in die normale Telefon-Galerie kopiert. Geteilte Kopien in einen Chat laufen mit Burning ab.',
      },
      {
        type: 'p',
        text: 'Notizen — Text und Listen bleiben in einem Vault auf dem Gerät.',
      },
      {
        type: 'p',
        text: 'Kalender — Termine und Erinnerungen bleiben auf dem Gerät. Erinnerungs-Hinweise nutzen denselben dezenten Stil wie andere Benachrichtigungen (zeigen nie den echten Termintitel auf dem Sperrbildschirm).',
      },
    ],
  },
  {
    id: 'online',
    title: '8. Was online existieren darf (so wenig wie möglich)',
    blocks: [
      {
        type: 'p',
        text: 'Für Zustellung und Website kann der Dienst nur Verarbeiten, was nötig ist, zum Beispiel:',
      },
      {
        type: 'ul',
        items: [
          'eine zufällige technische Konto-ID (keine E-Mail/Telefon für die App nötig)',
          'gesperrte Nachrichtenpakete (Ciphertext)',
          'wer ein Paket erhalten soll und wann es abläuft',
          'Hashes öffentlicher Einladungs-Token und versiegelte Einladungs-Umschläge (deine NEVULA-ID steht nicht im öffentlichen Link)',
          'wenn Push aktiv: ein Geräte-Push-Token für Wake-ups (siehe Abschnitt 10)',
          'begrenztes Material zur Identitäts-Wiederherstellung, wenn du Recovery aktivierst (siehe Abschnitt 11) — genug, um nur deine NEVULA-ID wiederherzustellen',
          'Community-Nickname, Passwort-Hash, Beiträge, Antworten, Sitzungen',
          'normale technische Logs (z. B. IP oder Zeit), wo Infrastruktur sie braucht',
        ],
      },
      {
        type: 'p',
        text: 'Ziel: so wenig wie möglich online. Wenn etwas für die Zustellung existieren muss, soll es gesperrt oder Nicht-Inhalts-Metadaten sein — keine lesbare Kopie deines privaten Lebens. Zustellpakete leben nie länger als 28 Tage.',
      },
    ],
  },
  {
    id: 'tor',
    title: '9. Optional Tor (NevTOR)',
    blocks: [
      {
        type: 'p',
        text: 'Mit verbundenem Orbot kannst du NevTOR einschalten. Für eine einzelne Unterhaltung kannst du Tor verlangen: Dann brauchen beide Seiten Tor, um neue Nachrichten zu senden und zu lesen. Ein dezenter Push kann trotzdem melden, dass etwas angekommen ist, ohne den Chat-Text zu zeigen, bis Tor bereit ist.',
      },
      {
        type: 'p',
        text: 'Tor ist ein zusätzlicher Netzwerkpfad. Er ersetzt nicht das Sperren von Nachrichten auf dem Telefon. NVL3-Ende-zu-Ende-Verschlüsselung inklusive Post-Quantum-Härtung des Schlüsselaustauschs gilt mit und ohne Tor. Orbot aus der App zu öffnen startet die auf dem Telefon installierte Orbot-App, sofern verfügbar.',
      },
    ],
  },
  {
    id: 'benachrichtigungen',
    title: '10. Dezente Benachrichtigungen',
    blocks: [
      {
        type: 'p',
        text: 'Push-Hinweise sind optional. Wenn an, zeigen sie auf dem Sperrbildschirm nie NEVULA, Chat-Text oder Kalendertitel. Du wählst nur Badge oder kurzen Tarntext (z. B. Taschenrechner-Hinweis).',
      },
      {
        type: 'p',
        text: 'Hinweise sind für Zeiten gedacht, in denen der private Bereich nicht aktiv offen ist. Während du NEVULA im Vordergrund nutzt, soll die App das System-Tray nicht mit diesen Wake-ups zuspammen; stattdessen gibt es In-App-Hinweise (z. B. Ungelesen-Markierungen).',
      },
      {
        type: 'p',
        text: 'Für ein Remote-Wake-up kann die App ein Geräte-Push-Token beim Zustell-Backend registrieren und auf Android Googles Firebase Cloud Messaging (FCM) nutzen. Dieses Token identifiziert das Gerät nur für Wake-ups — nicht deine Nachrichten. Wenn du Push ausschaltest, wird die Registrierung so weit entfernt, wie die App das kann.',
      },
      {
        type: 'p',
        text: 'Auf manchen Telefonen (inkl. mancher Honor/Huawei-Modelle) kann das System Hintergrund-Zustellung verzögern, wenn die App nicht laufen darf (z. B. uneingeschränkter Akku / Autostart). Das ist eine Betriebssystem-Einstellung, keine Änderung daran, was der Hinweis anzeigen darf.',
      },
    ],
  },
  {
    id: 'wiederherstellung',
    title: '11. Wiederherstellung — nur NEVULA-ID',
    blocks: [
      {
        type: 'p',
        text: 'Wiederherstellung kann deine NEVULA-ID auf einem anderen Android-Telefon zurückbringen. Sie stellt nicht Chats, Kontakte, Galerie, Notizen, Kalender oder frühere Geräte-Verschlüsselungsschlüssel wieder her. Es gibt kein vollständiges Cloud-Backup deines privaten Bereichs.',
      },
      {
        type: 'p',
        text: 'Bewahre Recovery-ID und Recovery-Key offline auf. Der Support kann sie nicht für dich neu erzeugen.',
      },
    ],
  },
  {
    id: 'einladungen',
    title: '12. Öffentliche Kontakt-Einladungen',
    blocks: [
      {
        type: 'p',
        text: 'Du kannst einen widerrufbaren Link oder QR erzeugen, damit andere Kontakt anfragen können. Die Website übergibt nur ein Token in die App. Das beweist nicht, wer jemand im echten Leben ist. Du kannst die Einladung ersetzen oder widerrufen.',
      },
    ],
  },
  {
    id: 'community',
    title: '13. Community auf dieser Website',
    blocks: [
      {
        type: 'p',
        text: 'Die Community ist von privaten Chats getrennt. Der Zugang startet aus der entsperrten App. Nicknames, Beiträge und Antworten sind für Mitglieder sichtbar. Wir speichern Nickname, Login-Daten (Passwort-Hash), Sitzungen und Moderationsmeldungen — nicht private Nachrichteninhalte oder Chat-Schlüssel.',
      },
    ],
  },
  {
    id: 'loeschung',
    title: '14. Löschung — auf dem Telefon und online',
    blocks: [
      {
        type: 'p',
        text: 'Lokales Wischen und Online-Kontolöschung sind getrennt. Das eine macht nicht automatisch das andere.',
      },
      {
        type: 'p',
        text: 'A — Dieses Telefon wischen (lokal): siehe auch Abschnitt 2. Wenn die App gesperrt ist, erscheint beim Öffnen wieder der Taschenrechner. Zerstörungscode eingeben (unter Einstellungen → Zugang gesetzt) und = drücken, um private Daten auf diesem Telefon sofort zu löschen (funktioniert offline). Oder nach dem Entsperren: SOS auf dem Startbildschirm tippen, oder Einstellungen → Kontolöschung und Emergency Kill (Entriegelungs-PIN, dann bestätigen).',
      },
      {
        type: 'p',
        text: 'B — Online-Konto löschen:',
      },
      {
        type: 'ul',
        items: [
          'In der App: Einstellungen → Kontolöschung. External deletion code erzeugen und außerhalb des Telefons aufbewahren.',
          'Auf dieser Website: Seite „Daten löschen“ öffnen und NEVULA-ID plus Personal Delete Key / Löschcode eingeben (bei Setup erhalten oder in der App neu erzeugt). Das entfernt das anonyme Online-Konto und verknüpfte Serverdaten, die wir zuordnen können.',
        ],
      },
      {
        type: 'p',
        text: 'Gesperrte ausgehende Zustellpakete können verschlüsselt bis zum Ablauf bleiben (≤ 28 Tage), wenn sie nicht mehr zu dir zuordenbar sind. Galerie, Notizen und Kalender auf dem Telefon werden nur durch lokales Wischen (A) entfernt, nicht allein durch das Website-Formular.',
      },
      {
        type: 'p',
        text: 'Inaktivität: Nach 28 Tagen ohne Entriegelung des privaten Bereichs werden Galerie, Notizen und Kalender auf diesem Telefon automatisch gelöscht.',
      },
      {
        type: 'p',
        text: 'Burning: Chat-Inhalt läuft immer auf den Timern ab, die du setzt (max. 28 Tage). Abgelaufene Pakete werden automatisch entfernt.',
      },
    ],
  },
  {
    id: 'berechtigungen',
    title: '15. Telefon-Berechtigungen',
    blocks: [
      {
        type: 'ul',
        items: [
          'Kamera — Galerie-Aufnahme und QR-Pairing / Einladungs-Scan',
          'Mikrofon — Sprachnachrichten (auf dem Gerät neu gesprochen; Originalaufnahme verworfen, nicht gesendet)',
          'Fotos / Dateien — Import in die private Galerie',
          'Benachrichtigungen — optionale dezente Hinweise',
          'Internet — Authentifizierung und verschlüsselte Zustellung; optionaler Tor-Pfad über Orbot',
        ],
      },
    ],
  },
  {
    id: 'anbieter',
    title: '16. Anbieter und Werbung',
    blocks: [
      {
        type: 'p',
        text: 'Zustell- und Auth-Infrastruktur umfasst Supabase. Optionale Remote-Wake-ups nutzen Google Firebase Cloud Messaging auf Android. Die aktuelle App hat kein Werbe-SDK und verkauft keine Nutzerdaten.',
      },
    ],
  },
  {
    id: 'sicherheit',
    title: '17. Kontinuierliche Sicherheit',
    blocks: [
      {
        type: 'p',
        text: 'Siehe die Einleitung oben zum Design-Ansatz. Schutzmaßnahmen werden laufend verbessert. Verifizierte Mitglieder können Verbesserungen im Community Board vorschlagen.',
      },
    ],
  },
  {
    id: 'kontakt',
    title: '18. Kontakt',
    blocks: [
      {
        type: 'p',
        text: 'Fragen: Support-Formular nutzen. Wichtige Änderungen aktualisieren diese Seite.',
      },
    ],
  },
  {
    id: 'verantwortlich',
    title: '19. Verantwortliche Stelle',
    blocks: [
      {
        type: 'p',
        text: 'Denny Almeida\n[Anschrift des Verantwortlichen]',
      },
    ],
  },
];
