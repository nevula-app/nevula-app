// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { Metadata } from 'next';
import DeletePageView from '@/components/delete-page';

export const metadata: Metadata = {
  title: 'Delete data',
  description: 'Wipe this phone or delete the NEVULA online account.',
};

export default function DeletePage() {
  return <DeletePageView />;
}
