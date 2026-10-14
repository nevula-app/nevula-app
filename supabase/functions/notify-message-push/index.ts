// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { createClient } from 'npm:@supabase/supabase-js@2.112.4';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

/**
 * Remote Calculator push for new sealed blobs.
 * Never receives or forwards message bodies — only recipient_id + stored disguise prefs.
 *
 * Secrets (Supabase Edge Function):
 * - FCM_SERVICE_ACCOUNT_JSON: full Firebase service-account JSON (Cloud Messaging)
 * - FCM_PROJECT_ID: Firebase project id (also in service account as project_id)
 * - NOTIFY_PUSH_HOOK_SECRET: optional shared secret for DB webhooks (Bearer)
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const hookSecret = Deno.env.get('NOTIFY_PUSH_HOOK_SECRET') ?? '';
const fcmProjectId = Deno.env.get('FCM_PROJECT_ID') ?? '';
const fcmServiceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_TEXTS = new Set([
  'Please return to your calculator.',
  'You still have an open calculation to complete.',
  'Your calculator is waiting for you.',
]);

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function parseServiceAccount(): ServiceAccount | null {
  if (!fcmServiceAccountRaw) return null;
  try {
    const sa = JSON.parse(fcmServiceAccountRaw) as ServiceAccount;
    // Dashboard / CLI often stores PEM with literal \n instead of real newlines.
    if (typeof sa.private_key === 'string') {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    }
    return sa;
  } catch {
    return null;
  }
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  if (hookSecret && token === hookSecret) return { kind: 'hook' as const, userId: null };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { kind: 'user' as const, userId: data.user.id };
}

let cachedAccess: { token: string; exp: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.exp > now + 60) return cachedAccess.token;
  if (!sa.client_email || !sa.private_key) throw new Error('FCM service account incomplete');
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri || 'https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const payload = await res.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('FCM auth missing access_token');
  cachedAccess = {
    token: payload.access_token,
    exp: now + Math.max(60, Number(payload.expires_in) || 3600),
  };
  return payload.access_token;
}

async function sendFcm(params: {
  accessToken: string;
  projectId: string;
  deviceToken: string;
  title: string;
  body: string;
  badgeOnly: boolean;
}) {
  // Data-only + HIGH priority: wakes NevulaFirebaseMessagingService on Honor/Huawei
  // even when the app is force-asleep. System `notification` payloads often sit until
  // the user opens the app — which looked like "push only works inside the app".
  const message: Record<string, unknown> = {
    token: params.deviceToken,
    data: {
      nevulaMessageAlert: '1',
      badgeOnly: params.badgeOnly ? '1' : '0',
      title: params.title,
      body: params.badgeOnly ? '' : params.body,
    },
    android: {
      priority: 'HIGH',
      ttl: '86400s',
      direct_boot_ok: true,
      // System tray when the process is dead (Honor often delays data-only until open).
      // Data payload still wakes NevulaFirebaseMessagingService when the OS delivers it.
      notification: {
        title: params.title,
        body: params.badgeOnly ? '' : params.body,
        channel_id: params.badgeOnly ? 'nevula-messages-badge' : 'nevula-messages',
        notification_count: 1,
        default_vibrate_timings: !params.badgeOnly,
        default_sound: !params.badgeOnly,
      },
    },
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${params.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  );
  if (res.ok) return { ok: true as const };
  const text = await res.text();
  // Drop dead tokens so the next save re-registers.
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(text)) {
    return { ok: false as const, dead: true };
  }
  return { ok: false as const, dead: false, error: text.slice(0, 240) };
}

async function sendExpo(params: {
  token: string;
  title: string;
  body: string;
  badgeOnly: boolean;
}) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    },
    body: JSON.stringify([{
      to: params.token,
      title: params.title,
      body: params.badgeOnly ? '' : params.body,
      sound: params.badgeOnly ? null : 'default',
      channelId: params.badgeOnly ? 'nevula-messages-badge' : 'nevula-messages',
      priority: 'high',
      data: { nevulaMessageAlert: true, badgeOnly: params.badgeOnly },
    }]),
  });
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const auth = await authenticatedUser(req);
  if (!auth) return json({ error: 'Unauthorized.' }, 401);

  let body: { recipient_id?: string; recipientId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }
  const recipientId = String(body.recipient_id ?? body.recipientId ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(recipientId)) {
    return json({ error: 'Invalid recipient.' }, 400);
  }

  // Authenticated callers may only ping a recipient after they can already insert blobs.
  // Hook secret is for DB webhooks. Never echo private message content.
  if (auth.kind === 'user' && auth.userId === recipientId) {
    return json({ error: 'No self notify.' }, 400);
  }

  const sa = parseServiceAccount();
  const projectId = fcmProjectId || sa?.project_id || '';
  if (!sa || !projectId) {
    return json({ error: 'FCM is not configured on the server.' }, 503);
  }

  const { data: tokens, error } = await admin
    .from('device_push_tokens')
    .select('token, badge_only, disguised_text, enabled')
    .eq('user_id', recipientId)
    .eq('enabled', true);
  if (error) return json({ error: 'Token lookup failed.', detail: error.message?.slice?.(0, 120) }, 500);
  if (!tokens?.length) return json({ ok: false, sent: 0, error: 'no-tokens' }, 404);

  let accessToken = '';
  try {
    accessToken = await getFcmAccessToken(sa);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    return json({ error: 'FCM auth failed.', detail: detail.slice(0, 120) }, 503);
  }

  let sent = 0;
  let failed = 0;
  let lastError = '';
  for (const row of tokens) {
    const text = ALLOWED_TEXTS.has(row.disguised_text)
      ? row.disguised_text
      : 'Please return to your calculator.';
    const badgeOnly = row.badge_only === true;
    const token = String(row.token ?? '');
    if (!token) continue;

    if (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')) {
      if (await sendExpo({ token, title: 'Calculator', body: text, badgeOnly })) sent += 1;
      else {
        failed += 1;
        lastError = 'expo-push-failed';
      }
      continue;
    }

    const result = await sendFcm({
      accessToken,
      projectId,
      deviceToken: token,
      title: 'Calculator',
      body: text,
      badgeOnly,
    });
    if (result.ok) {
      sent += 1;
    } else if (result.dead) {
      failed += 1;
      lastError = 'dead-token';
      await admin.from('device_push_tokens').delete().eq('user_id', recipientId).eq('token', token);
    } else {
      failed += 1;
      lastError = result.error ?? 'fcm-send-failed';
    }
  }

  return json({
    ok: sent > 0,
    sent,
    failed,
    tokens: tokens.length,
    ...(sent === 0 && lastError ? { error: lastError.slice(0, 240) } : {}),
  }, sent > 0 ? 200 : 502);
});
