// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginView } from '@/components/login-view';
import { memberFromCookie } from '@/lib/community-db';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await memberFromCookie((await headers()).get('cookie'))) redirect('/community');
  return <LoginView />;
}
