// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { createClient } from '@supabase/supabase-js';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

function recoveryEmail(recoveryId: string) {
  return `${recoveryId.replace(/-/g, '').toLowerCase()}@recover.nevula.invalid`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization') ?? '';
  if (!supabaseUrl || !serviceRole || !authorization.startsWith('Bearer ')) {
    return response(401, { error: 'not_authenticated' });
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authorization.slice('Bearer '.length);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return response(401, { error: 'not_authenticated' });

  const body = await request.json().catch(() => ({}));
  const recoveryId = typeof body.recoveryId === 'string' ? body.recoveryId.trim().toUpperCase() : '';
  const recoveryKey = typeof body.recoveryKey === 'string' ? body.recoveryKey.trim() : '';
  const encryptedContacts = typeof body.encryptedContacts === 'string' ? body.encryptedContacts : '';
  if (!/^NVR(-[A-F0-9]{4}){6}$/.test(recoveryId) || !/^NVRK-[A-F0-9]{64}$/.test(recoveryKey) || encryptedContacts.length < 32 || encryptedContacts.length > 262144) {
    return response(400, { error: 'invalid_recovery_material' });
  }

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: recoveryEmail(recoveryId),
    password: recoveryKey,
    email_confirm: true,
  });
  if (authError) return response(409, { error: 'recovery_registration_failed' });

  const { error: backupError } = await admin.from('identity_recovery_backups').upsert({
    user_id: user.id,
    recovery_id: recoveryId,
    encrypted_contacts: encryptedContacts,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (backupError) return response(500, { error: 'recovery_backup_failed' });
  return response(200, { ok: true });
});
