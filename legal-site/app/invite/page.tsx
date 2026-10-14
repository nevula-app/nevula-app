// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import { InviteClient } from '@/components/invite-client';

export const metadata: Metadata = {
  title: 'Invite',
  description: undefined,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  openGraph: undefined,
  twitter: undefined,
};

/** Sterile handoff only — no nav to imprint/privacy, no personal or third-party names. */
export default function InvitePage() {
  return (
    <div className="site invite-site invite-sterile">
      <main>
        <InviteClient />
      </main>
    </div>
  );
}
