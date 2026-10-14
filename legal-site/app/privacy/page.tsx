// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import PrivacyPageView from '@/components/privacy-page';

export const metadata: Metadata = {
  title: 'Privacy & Security',
  description:
    'What stays on your phone, what may exist online, deletion, recovery and Tor — NEVULA privacy policy.',
};

export default function PrivacyPage() {
  return <PrivacyPageView />;
}
