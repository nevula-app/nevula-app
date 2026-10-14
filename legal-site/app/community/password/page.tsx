// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { headers } from 'next/headers';
import { PasswordView } from '@/components/password-view';
import { setupFromCookie } from '@/lib/community-auth';

export const dynamic = 'force-dynamic';

export default async function PasswordPage() {
  const grant = await setupFromCookie((await headers()).get('cookie'));
  return <PasswordView nickname={grant?.login_name ?? null} />;
}
