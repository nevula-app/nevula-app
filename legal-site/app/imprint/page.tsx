// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import ImprintPageView from '@/components/imprint-page';

export const metadata: Metadata = {
  title: 'Imprint',
  description: 'Operator and contact for NEVULA.',
};

export default function ImprintPage() {
  return <ImprintPageView />;
}
