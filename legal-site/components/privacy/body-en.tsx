// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { BrandWord } from '@/components/site-shell';

const toc = [
  { id: 'was-ist', label: '1. What NEVULA is' },
  { id: 'calculator-gate', label: '2. Calculator gate' },
  { id: 'erscheinung', label: '3. Discreet appearance' },
  { id: 'auf-dem-telefon', label: '4. What stays on your phone' },
  { id: 'nvl3', label: '5. Locked chats — NVL3' },
  { id: 'sprachnotizen', label: '6. Voice notes' },
  { id: 'galerie-notizen-kalender', label: '7. Gallery, Notes and Calendar' },
  { id: 'online', label: '8. What may exist online' },
  { id: 'tor', label: '9. Optional Tor (NevTOR)' },
  { id: 'benachrichtigungen', label: '10. Discreet notifications' },
  { id: 'wiederherstellung', label: '11. Recovery' },
  { id: 'einladungen', label: '12. Public contact invites' },
  { id: 'community', label: '13. Community on this website' },
  { id: 'loeschung', label: '14. Deletion' },
  { id: 'berechtigungen', label: '15. Phone permissions' },
  { id: 'anbieter', label: '16. Providers and ads' },
  { id: 'sicherheit', label: '17. Continuous security' },
  { id: 'kontakt', label: '18. Contact' },
  { id: 'verantwortlich', label: '19. Who is responsible' },
] as const;

export function PrivacyBodyEn({
  tocLabel,
  tocAria,
}: {
  tocLabel: string;
  tocAria: string;
}) {
  return (
    <>
      <nav className="privacyToc" aria-label={tocAria}>
        <p className="privacyTocLabel">{tocLabel}</p>
        <ol>
          {toc.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ol>
      </nav>
<section id="was-ist">
        <h2>
          1. What <BrandWord /> is
        </h2>
        <p>
          <BrandWord /> is a private Android space. You can open it as <BrandWord /> or hide it as a
          calculator (Hidden mode). Inside you get encrypted messaging, re-spoken voice notes, Notes,
          Calendar, a private Gallery (with camera), optional Tor (NevTOR with Orbot), public contact
          invites, and a members Community on this website. You do not need an email address or phone
          number for the app identity.
        </p>
      </section>

      <section id="calculator-gate">
        <h2>2. Calculator gate — entry PIN and destruction PIN</h2>
        <p>
          The private area sits behind a calculator cover. When you open the locked app, you see that
          calculator again and enter a code, then confirm with <code>=</code>. When you set up{' '}
          <BrandWord /> you choose:
        </p>
        <ul>
          <li>
            <strong>Entry PIN</strong> — unlocks your private space.
          </li>
          <li>
            <strong>Destruction PIN</strong> — a separate code. If someone enters it on the calculator
            cover and confirms with <code>=</code>, the private space on that phone is wiped at once.
          </li>
        </ul>
        <p>
          Both codes stay on the device. They are not sent to our servers. You decide which code to
          use in a given moment: unlock, or destroy. You can change both codes later under{' '}
          <strong>Settings → Access</strong> (calculator PIN and emergency wipe).
        </p>
        <p>
          The destruction PIN and Emergency Kill run only on this phone. They do not need a server
          connection. Deleting the online account is a separate step and does need the network.
        </p>
        <p>
          Inside the unlocked app you can also trigger <strong>Emergency Kill</strong> from the red{' '}
          <strong>SOS</strong> control on the home screen, or under <strong>Settings → Account
          deletion</strong> (after confirming your entry PIN). That erases the private vault on this
          phone. It does not by itself delete your online account — see section 14.
        </p>
        <p>
          Repeated wrong PIN attempts lead to temporary lockouts and, after continued failures, to an
          automatic local wipe of the private space on that device.
        </p>
        <p>
          After a successful unlock you can choose <strong>Stay unlocked</strong> for a limited time
          (from 10 minutes up to 3 hours). For that window the private area can reopen without the
          calculator PIN — including if you leave the app and return. The choice stays on this phone
          only. When the window ends, the calculator gate appears again.
        </p>
      </section>

      <section id="erscheinung">
        <h2>3. Discreet appearance</h2>
        <p>
          You can show the <BrandWord /> icon and name on the home screen, or switch to{' '}
          <strong>Hidden mode</strong>: a neutral calculator icon and the label “Calculator”, so the
          app looks like a normal calculator utility. The Hidden-mode icon does{' '}
          <strong>not</strong> include the <BrandWord /> “N” mark. That choice stays on the phone and
          does not change encryption, your PINs, or your stored private content.
        </p>
      </section>

      <section id="auf-dem-telefon">
        <h2>4. What stays on your phone</h2>
        <p>
          The following are meant to stay on the device (app-private / secure storage), not as readable
          cloud content:
        </p>
        <ul>
          <li>Notes, Calendar events, Gallery photos/videos/files</li>
          <li>Local contacts, chat labels, and local chat-list metadata</li>
          <li>Encryption keys and secure sessions</li>
          <li>Entry PIN, destruction PIN, Tor and chat settings</li>
          <li>Notification preferences and launcher appearance</li>
        </ul>
        <p>
          Where supported, extra photo/video file info (such as location or device tags) is removed
          before Gallery storage or sending.
        </p>
      </section>

      <section id="nvl3">
        <h2>5. Locked chats — NVL3 encryption</h2>
        <p>
          Message text, attachments and voice notes are locked on the phone before they are sent.
          Delivery stores locked packages. We are not meant to read your chat content from the server.
        </p>
        <p>
          New chats use <strong>NVL3</strong>: a Double Ratchet with per-message keys on this device
          (shown in the app as <strong>NVL3 ACTIVE</strong>). Keys rotate as you talk. Older package
          formats are legacy read paths only — not how new messages are written.
        </p>
        <p>
          <strong>Post-quantum layer (additional):</strong> NVL3 also uses a quantum-resistant key
          exchange. This high-security measure addresses harvest-now-decrypt-later — adversaries who
          archive encrypted traffic now and wait for future quantum computers. Even then, those
          archives should stay useless. Post-quantum does not replace E2EE; it hardens the keys that
          E2EE depends on.
        </p>
        <p>
          Pairing with a contact uses in-person QR (or a decrypted invite path) — not a public
          searchable directory of everyone&apos;s identity. That QR pairing is separate from NVL3
          encryption and from optional Tor.
        </p>
        <p>
          Messaging is one-to-one by default. You can also invite contacts into an existing chat
          (Invite in the conversation) to form a small group. The same locking and burning rules
          apply.
        </p>
        <p>
          <strong>Burning:</strong> messages always expire. You choose how long (minutes, hours or
          days), up to a hard maximum of 28 days. On the server, delivery copies stay encrypted — not
          as readable chat text — and are deleted automatically when they expire (and typically after
          they have been fetched). Many services keep message history indefinitely; here everything is
          removed on purpose.
        </p>
      </section>

      <section id="sprachnotizen">
        <h2>6. Voice notes</h2>
        <p>
          Voice notes are not a disguised recording of your voice. On the phone, spoken words are
          understood and then spoken again by a synthetic voice (for example Robot / Chatter /
          Synthetic). Only that newly spoken audio is locked and sent. The original microphone
          recording is discarded on the device and is not kept for delivery — there is no path back
          to your real voice from the voice note. Burning rules are the same as for other messages.
        </p>
      </section>

      <section id="galerie-notizen-kalender">
        <h2>7. Gallery, Notes and Calendar</h2>
        <p>
          <strong>Gallery</strong> — private photos, videos and files stay encrypted on the device.
          They are not copied into the normal phone gallery. Shared copies to a chat expire with
          burning.
        </p>
        <p>
          <strong>Notes</strong> — text and lists stay in an on-device vault.
        </p>
        <p>
          <strong>Calendar</strong> — appointments and reminders stay on the device. Reminder alerts
          use the same discreet style as other notifications (never show the real appointment title on
          the lock screen).
        </p>
      </section>

      <section id="online">
        <h2>8. What may exist online (as little as possible)</h2>
        <p>For delivery and the website, the service may process only what is needed, for example:</p>
        <ul>
          <li>A random technical account id (no email/phone required for the app)</li>
          <li>Locked message packages (ciphertext)</li>
          <li>Who should receive a package and when it expires</li>
          <li>
            Public invite token hashes and sealed invite envelopes (your <BrandWord /> ID is not put in
            the public link)
          </li>
          <li>If you enable push alerts: a device push token so a wake-up can be delivered (see section 10)</li>
          <li>
            Limited identity-recovery material if you activate recovery (see section 11) — enough to
            restore your <BrandWord /> ID only
          </li>
          <li>Community nickname, password hash, posts, replies, sessions</li>
          <li>Normal technical logs (such as IP or time) where infrastructure requires them</li>
        </ul>
        <p>
          Goal: as little as possible online. When something must exist for delivery, it should be
          locked or non-content metadata — not a readable copy of your private life. Delivery packages
          never live longer than 28 days.
        </p>
      </section>

      <section id="tor">
        <h2>9. Optional Tor (NevTOR)</h2>
        <p>
          With Orbot connected you can turn NevTOR on. For a single conversation you can require Tor:
          then both people need Tor to send and to read new messages. A discreet push can still say
          that something arrived, without showing the chat text until Tor is ready.
        </p>
        <p>
          Tor is an extra network path. It does not replace locking messages on the phone. NVL3
          end-to-end encryption, including post-quantum hardening of the key exchange, applies with
          and without Tor. Opening Orbot from the app launches the Orbot app
          installed on your phone when available.
        </p>
      </section>

      <section id="benachrichtigungen">
        <h2>10. Discreet notifications</h2>
        <p>
          Push alerts are optional. When on, they never show <BrandWord />, chat text or calendar
          titles on the lock screen. You choose badge-only or a short disguise text (for example a
          calculator hint).
        </p>
        <p>
          Alerts are meant for when the private area is not actively open. While you are using{' '}
          <BrandWord /> in the foreground, the app is designed not to spam the system tray with those
          wake-ups; in-app indicators (such as unread marks) are used instead.
        </p>
        <p>
          To deliver a remote wake-up, the app may register a device push token with our delivery
          backend and use Google’s Firebase Cloud Messaging (FCM) on Android. That token identifies
          the device for wake-ups only — not your messages. If you turn push off, registration is
          removed as far as the app can do so.
        </p>
        <p>
          On some phones (including some Honor/Huawei models), the system may delay background
          delivery unless you allow the app to run (for example unrestricted battery / autostart).
          That is an operating-system setting, not a change to what the alert may display.
        </p>
      </section>

      <section id="wiederherstellung">
        <h2>
          11. Recovery — <BrandWord /> ID only
        </h2>
        <p>
          Recovery can bring back your <BrandWord /> ID on another Android phone. It does not restore
          chats, contacts, Gallery, Notes, Calendar or previous device encryption keys. There is no
          full cloud backup of your private space.
        </p>
        <p>
          Keep Recovery ID and Recovery Key offline. Support cannot recreate them for you.
        </p>
      </section>

      <section id="einladungen">
        <h2>12. Public contact invites</h2>
        <p>
          You can create a revocable link or QR so others can request contact. The website only passes
          a token into the app. That does not prove who someone is in real life. You can replace or
          revoke the invite.
        </p>
      </section>

      <section id="community">
        <h2>13. Community on this website</h2>
        <p>
          The Community is separate from private chats. Access starts from the unlocked app. Nicknames,
          posts and replies are visible to members. We store nickname, login data (password hash),
          sessions and moderation reports — not private message content or chat keys.
        </p>
      </section>

      <section id="loeschung">
        <h2>14. Deletion — on the phone and online</h2>
        <p>
          Local wipe and online-account deletion are separate. One does not automatically do the other.
        </p>
        <p>
          <strong>A — Wipe this phone (local):</strong> see also{' '}
          <a href="#calculator-gate">section 2</a>. When the app is locked, the calculator appears
          again at open. Enter your <strong>destruction PIN</strong> (set under{' '}
          <strong>Settings → Access</strong>) and press <code>=</code> to erase private data on that
          phone immediately (works offline). Or, after unlock: tap <strong>SOS</strong> on the home
          screen, or open <strong>Settings → Account deletion</strong> and use{' '}
          <strong>Emergency Kill</strong> (entry PIN, then confirm).
        </p>
        <p>
          <strong>B — Delete the online account:</strong>
        </p>
        <ul>
          <li>
            <strong>In the app:</strong> Settings → Account deletion. Generate an{' '}
            <strong>external deletion code</strong> and keep it outside the phone.
          </li>
          <li>
            <strong>On this website:</strong> open the <a href="/delete">Data Deletion</a> page and
            enter your <BrandWord /> ID plus the <strong>Personal Delete Key</strong> / deletion code
            you received at setup (or regenerated in the app). That removes the anonymous online
            account and linked server records we can attribute.
          </li>
        </ul>
        <p>
          Locked outbound delivery packages may remain encrypted until they expire (≤ 28 days) if they
          can no longer be tied to you. Gallery, Notes and Calendar on the phone are only removed by a
          local wipe (A), not by the website form alone.
        </p>
        <p>
          <strong>Inactivity:</strong> after 28 days without unlocking the private area, Gallery, Notes
          and Calendar on that phone are wiped automatically.
        </p>
        <p>
          <strong>Burning:</strong> chat content always expires on the timers you set (max 28 days).
          Expired packages are removed automatically.
        </p>
      </section>

      <section id="berechtigungen">
        <h2>15. Phone permissions</h2>
        <ul>
          <li>Camera — Gallery capture and QR pairing / invite scan</li>
          <li>Microphone — voice notes (re-spoken on device; original recording discarded, not sent)</li>
          <li>Photos / files — import into the private Gallery</li>
          <li>Notifications — optional discreet alerts</li>
          <li>Internet — authentication and encrypted delivery; optional Tor path via Orbot</li>
        </ul>
      </section>

      <section id="anbieter">
        <h2>16. Providers and ads</h2>
        <p>
          Delivery and auth infrastructure includes Supabase. Optional remote wake-ups use Google
          Firebase Cloud Messaging on Android. The current app has no advertising SDK and does not
          sell personal data.
        </p>
      </section>

      <section id="sicherheit">
        <h2>17. Continuous security</h2>
        <p>
          See the introduction above for the design approach. We keep improving protective measures
          over time. Verified members may suggest improvements on the{' '}
          <a href="/community">Community Board</a>.
        </p>
      </section>

      <section id="kontakt">
        <h2>18. Contact</h2>
        <p>
          Questions: use the <a href="/help">support form</a>. Important changes will update this
          page.
        </p>
      </section>

      <section id="verantwortlich">
        <h2>19. Who is responsible</h2>
        <p>
          Denny Almeida
          <br />
          Rua das Violetas 11 – 2 Dto
          <br />
          2870-296 Montijo, Portugal
        </p>
      </section>
    </>
  );
}
