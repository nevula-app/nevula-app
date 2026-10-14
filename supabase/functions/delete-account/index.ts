// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const allowedOrigin = Deno.env.get('DELETE_ACCOUNT_ALLOWED_ORIGIN') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const deletionPepper = Deno.env.get('ACCOUNT_DELETION_PEPPER') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const idPattern = /^NVL-[0-9A-F]{3}-[0-9A-F]{3}-[0-9A-F]{4}$/;
const codePattern = /^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/;

function cors(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  if (!allowedOrigin || origin !== allowedOrigin) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, 'cache-control': 'no-store' } });
}

function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

async function digest(code: string) {
  const bytes = new TextEncoder().encode(`${deletionPepper}:${code}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
}

async function allowExternalAttempt(req: Request) {
  const client = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown')
    .split(',')[0].trim();
  const clientDigest = await digest(`client:${client}`);
  const { data, error: readError } = await admin.from('account_deletion_attempts')
    .select('attempts,window_started_at').eq('client_digest', clientDigest).maybeSingle();
  if (readError) throw readError;
  const now = Date.now();
  const windowExpired = !data || now - Date.parse(data.window_started_at) >= 15 * 60 * 1000;
  const attempts = windowExpired ? 1 : data.attempts + 1;
  const { error: writeError } = await admin.from('account_deletion_attempts').upsert({
    client_digest: clientDigest,
    attempts,
    window_started_at: windowExpired ? new Date(now).toISOString() : data.window_started_at,
    expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
  });
  if (writeError) throw writeError;
  await admin.from('account_deletion_attempts').delete().lt('expires_at', new Date(now).toISOString());
  return attempts <= 10;
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const { data, error } = await admin.auth.getUser(header.slice(7));
  return error ? null : data.user;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req);
  if (!corsHeaders) return json({ error: 'Origin not allowed.' }, 403, {});
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, corsHeaders);
  if (!supabaseUrl || !serviceRoleKey || deletionPepper.length < 32) {
    return json({ error: 'Deletion service is not configured.' }, 503, corsHeaders);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400, corsHeaders); }
  const action = String(body.action ?? 'external');

  if (action === 'register') {
    const user = await authenticatedUser(req);
    const nevulaId = String(body.nevulaId ?? '').trim().toUpperCase();
    const deletionCode = normalizeCode(body.deletionCode);
    if (!user || !idPattern.test(nevulaId) || !codePattern.test(deletionCode)) {
      return json({ error: 'Invalid request.' }, 400, corsHeaders);
    }
    const { error } = await admin.from('account_deletion_credentials').upsert({
      user_id: user.id,
      nevula_id: nevulaId,
      code_digest: await digest(deletionCode),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    return error ? json({ error: 'Deletion code could not be registered.' }, 500, corsHeaders) : json({ ok: true }, 200, corsHeaders);
  }

  if (action === 'delete_session') {
    const user = await authenticatedUser(req);
    if (!user) return json({ error: 'Invalid request.' }, 400, corsHeaders);
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    return error ? json({ error: 'Account deletion could not be completed.' }, 500, corsHeaders) : json({ ok: true }, 200, corsHeaders);
  }

  const nevulaId = String(body.nevulaId ?? '').trim().toUpperCase();
  const deletionCode = normalizeCode(body.deletionCode);
  if (!idPattern.test(nevulaId) || !codePattern.test(deletionCode)) {
    return json({ error: 'The account details could not be verified.' }, 400, corsHeaders);
  }
  try {
    if (!(await allowExternalAttempt(req))) return json({ error: 'Please try again later.' }, 429, corsHeaders);
  } catch {
    return json({ error: 'Deletion service is temporarily unavailable.' }, 503, corsHeaders);
  }
  const codeDigest = await digest(deletionCode);
  const { data: credential, error: credentialError } = await admin.from('account_deletion_credentials')
    .select('user_id,nevula_id,code_digest').eq('code_digest', codeDigest).maybeSingle();
  if (credentialError) return json({ error: 'Deletion service is temporarily unavailable.' }, 503, corsHeaders);
  const valid = credential
    ? constantTimeEqual(credential.code_digest, codeDigest) && constantTimeEqual(credential.nevula_id, nevulaId)
    : false;
  if (!valid) {
    return json({ error: 'The account details could not be verified.' }, 400, corsHeaders);
  }

  const { error } = await admin.auth.admin.deleteUser(credential.user_id, false);
  return error ? json({ error: 'Account deletion could not be completed.' }, 500, corsHeaders) : json({ ok: true }, 200, corsHeaders);
});
