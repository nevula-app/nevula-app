// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { env } from 'cloudflare:workers';

export type Member = { user_id:string; nickname:string; role:'member'|'moderator'|'admin'; suspended_at:string|null };
export async function db() {
  return (env as unknown as {DB:D1Database}).DB;
}
export async function sha256(value:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function randomToken(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
export async function memberFromCookie(cookieHeader:string|null):Promise<Member|null>{
  const token=cookieHeader?.match(/(?:^|;\s*)nevula_community=([^;]+)/)?.[1]; if(!token)return null;
  const database=await db(); const hash=await sha256(token);
  return database.prepare(`SELECT m.user_id,m.nickname,m.role,m.suspended_at FROM community_sessions s JOIN community_members m ON m.user_id=s.user_id JOIN community_credentials c ON c.user_id=m.user_id WHERE s.token_hash=? AND s.expires_at>? AND m.suspended_at IS NULL`).bind(hash,Date.now()).first<Member>();
}
