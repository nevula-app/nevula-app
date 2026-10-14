// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BrandWord, SiteShell } from '@/components/site-shell';
import { memberFromCookie } from '@/lib/community-db';
export const dynamic = 'force-dynamic';
export default async function WelcomePage() {
  const member = await memberFromCookie((await headers()).get('cookie'));
  if (!member) redirect('/community/login');
  return (
    <SiteShell>
      <article className="document welcomeDocument authFriendly">
        <p className="eyebrow">DU BIST DABEI</p>
        <h1>Willkommen in der Community, {member.nickname}.</h1>
        <p className="lede">
          Schön, dass du hier bist. Stell eine Frage, teile deine erste Idee oder erzähl uns, was wir
          an <BrandWord /> verbessern können.
        </p>
        <div className="communityActions">
          <a className="primaryLink" href="/community/new">
            Schreib deinen ersten Beitrag →
          </a>
          <a className="secondaryLink" href="/community">
            Erst einmal umschauen
          </a>
        </div>
        <section className="authInfo">
          <h2>Dein Name. Deine Perspektive.</h2>
          <p>
            Im Space sehen andere deinen Community-Namen. Beiträge und Antworten sind öffentlich.
            Behalte private Nachrichten, Kontaktdaten und Zugangsdaten für dich.
          </p>
          <p>
            Ab jetzt kannst du dich mit deinem Community-Namen und deinem Space-Passwort auch direkt
            auf der Website anmelden.
          </p>
        </section>
      </article>
    </SiteShell>
  );
}
