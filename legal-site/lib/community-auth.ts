// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { db, randomToken, sha256 } from './community-db';
export const SESSION_COOKIE = 'nevula_community';
export const SETUP_COOKIE = 'nevula_community_setup';
export const SESSION_SECONDS = 7 * 86400;
export function cookie(name: string, value: string, maxAge: number) {
  return name + '=' + value + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}
export function cookieValue(header: string | null, name: string) {
  const value = header?.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function authResponse(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return Response.json(body, { status, headers });
}
export function sameOriginJson(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin &&
    request.headers.get('content-type')?.split(';')[0] === 'application/json';
}
export async function readAuthBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!sameOriginJson(request)) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
export async function rateLimit(key: string, limit: number, windowMs = 15 * 60000) {
  const database = await db(); const now = Date.now();
  const row = await database.prepare(`INSERT INTO community_auth_limits(bucket_hash,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket_hash) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`)
    .bind(await sha256(key), now + windowMs, now, now).first<{ attempts: number }>();
  await database.prepare('DELETE FROM community_auth_limits WHERE expires_at<=?').bind(now).run();
  return (row?.attempts ?? limit + 1) <= limit;
}
export async function setupFromCookie(header: string | null) {
  const token = cookieValue(header, SETUP_COOKIE); if (!token) return null;
  const database = await db();
  return database.prepare(`SELECT g.user_id,g.token_hash,c.login_name FROM community_setup_grants g
    JOIN community_members m ON m.user_id=g.user_id LEFT JOIN community_credentials c ON c.user_id=g.user_id
    WHERE g.token_hash=? AND g.expires_at>? AND m.suspended_at IS NULL`)
    .bind(await sha256(token), Date.now()).first<{ user_id: string; token_hash: string; login_name: string | null }>();
}
export async function createSession(userId: string, passwordHash?: string) {
  const database = await db(); const token = randomToken(); const now = Date.now();
  // Do not issue a session for an old password when reset and login race.
  const result = await database.prepare(`INSERT INTO community_sessions(token_hash,user_id,expires_at,created_at)
    SELECT ?,m.user_id,?,? FROM community_members m JOIN community_credentials c ON c.user_id=m.user_id
    WHERE m.user_id=? AND m.suspended_at IS NULL AND (? IS NULL OR c.password_hash=?)`)
    .bind(await sha256(token), now + SESSION_SECONDS * 1000, now, userId, passwordHash ?? null, passwordHash ?? null).run();
  return result.meta.changes ? token : null;
}
