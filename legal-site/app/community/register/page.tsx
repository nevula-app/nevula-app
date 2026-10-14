// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RegisterView } from '@/components/register-view';
import { setupFromCookie } from '@/lib/community-auth';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const grant = await setupFromCookie((await headers()).get('cookie'));
  if (grant?.login_name) redirect('/community');
  return <RegisterView hasGrant={Boolean(grant)} />;
}
