// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { env } from './workers-env';
import { GET as connect } from '../app/community/connect/route';
import { POST as register } from '../app/api/community/register/route';
import { POST as login } from '../app/api/community/login/route';
import { POST as logout } from '../app/api/community/logout/route';
import { POST as post } from '../app/api/community/posts/route';
import { POST as issueCode } from '../app/api/community/login-code/route';
import { memberFromCookie, sha256 } from '../lib/community-db';
import { createSession, rateLimit, readAuthBody, setupFromCookie } from '../lib/community-auth';
import { hashPassword, verifyPassword } from '../lib/community-password';

let sqlite: DatabaseSync;
class Statement {
  values: SQLInputValue[] = [];
  constructor(private sql: string) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { const result = sqlite.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  for (const filename of ['0000_community.sql', '0001_community_credentials.sql'])
    sqlite.exec(readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
  env.DB = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); });
const password = 'a separate space password 2026';
function request(path: string, body: unknown, cookie = '', origin = 'https://nevula.de') {
  return new Request('https://nevula.de' + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
}
function cookies(response: Response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
async function appEntry(user = 'private-account-identifier', expires = Date.now() + 120000) {
  const code = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  sqlite.prepare('INSERT INTO community_login_codes(code_hash,user_id,expires_at) VALUES(?,?,?)').run(await sha256(code), user, expires);
  const url = 'https://nevula.de/community/connect?code=' + code;
  return { response: await connect(new Request(url)), url };
}
async function signUp(user = 'private-account-identifier', nickname = 'Member.Test') {
  const entry = await appEntry(user);
  const response = await register(request('/api/community/register', { nickname, password, confirmPassword: password }, cookies(entry.response)));
  expect(response.status).toBe(200);
  return response;
}
describe('Community registration and independent login', () => {
  it('requires a verified upstream app session and completed membership before issuing a code', async () => {
    expect((await issueCode(request('/api/community/login-code', {}))).status).toBe(401);
    const upstream = vi.fn().mockResolvedValueOnce(Response.json({ id: 'verified-member' })).mockResolvedValueOnce(Response.json([{ user_id: 'verified-member' }]));
    vi.stubGlobal('fetch', upstream);
    const appRequest = () => new Request('https://nevula.de/api/community/login-code', { method: 'POST', headers: { authorization: 'Bearer test-app-token', 'x-nevula-api-key': 'public-test-key' } });
    const response = await issueCode(appRequest());
    expect(response.status).toBe(200);
    const { code } = await response.json() as { code: string };
    expect(code).toMatch(/^[a-f0-9]{64}$/);
    expect(sqlite.prepare('SELECT code_hash FROM community_login_codes').get()?.code_hash).toBe(await sha256(code));
    upstream.mockResolvedValueOnce(Response.json({ id: 'unregistered-user' })).mockResolvedValueOnce(Response.json([]));
    expect((await issueCode(appRequest())).status).toBe(403);
    upstream.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect((await issueCode(appRequest())).status).toBe(401);
  });
  it('permits only one redemption when two requests race for an app link', async () => {
    const code = 'f'.repeat(64);
    sqlite.prepare('INSERT INTO community_login_codes(code_hash,user_id,expires_at) VALUES(?,?,?)').run(await sha256(code), 'racing-user', Date.now() + 120000);
    const url = 'https://nevula.de/community/connect?code=' + code;
    const responses = await Promise.all([connect(new Request(url)), connect(new Request(url))]);
    expect(responses.map(response => response.headers.get('location')).sort()).toEqual(['/community/register', '/community?login=expired'].sort());
  });
  it('requires app proof and rejects cross-origin or malformed requests', async () => {
    expect((await register(request('/api/community/register', { nickname: 'Test', password, confirmPassword: password }))).status).toBe(401);
    expect((await login(request('/api/community/login', {}, '', 'https://other.example'))).status).toBe(400);
    expect(await readAuthBody(request('/api/community/login', { payload: 'x'.repeat(5000) }))).toBeNull();
  });
  it('consumes a code only once and never exposes account-derived nicknames', async () => {
    const entry = await appEntry();
    expect(entry.response.headers.get('location')).toBe('/community/register');
    expect(entry.response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await memberFromCookie(cookies(entry.response))).toBeNull();
    expect((await connect(new Request(entry.url))).headers.get('location')).toContain('expired');
    expect(sqlite.prepare('SELECT nickname FROM community_members').get()?.nickname).not.toContain('private');
  });
  it('rejects expired app links and grants', async () => {
    expect((await appEntry('expired', Date.now() - 1000)).response.headers.get('location')).toContain('expired');
    const entry = await appEntry(); sqlite.exec('UPDATE community_setup_grants SET expires_at=0');
    expect(await setupFromCookie(cookies(entry.response))).toBeNull();
  });
  it('registers, greets, posts under the chosen name, logs out and logs back in', async () => {
    const registered = await signUp();
    expect(await registered.json()).toEqual({ next: '/community/welcome' });
    expect(registered.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    const session = cookies(registered);
    expect((await memberFromCookie(session))?.nickname).toBe('Member.Test');
    const posting = await post(request('/api/community/posts', { nickname: 'PretendAdmin', title: 'Meine erste Frage', body: 'Wie funktioniert die Community?', category: 'question' }, session));
    expect(posting.status).toBe(200);
    expect(sqlite.prepare('SELECT nickname FROM community_members').get()?.nickname).toBe('Member.Test');
    const credential = sqlite.prepare('SELECT password_hash FROM community_credentials').get()?.password_hash as string;
    expect(credential).not.toContain(password); expect(verifyPassword(password, credential)).toBe(true);
    await logout(request('/api/community/logout', {}, session));
    expect(await memberFromCookie(session)).toBeNull();
    const loggedIn = await login(request('/api/community/login', { nickname: 'Member.Test', password }));
    expect(loggedIn.status).toBe(200);
    expect((await memberFromCookie(cookies(loggedIn)))?.nickname).toBe('Member.Test');
  });
  it('rejects weak and mismatching passwords without consuming the app grant', async () => {
    const entry = await appEntry(); const proof = cookies(entry.response);
    for (const data of [{ password: 'short', confirmPassword: 'short' }, { password, confirmPassword: 'different' }])
      expect((await register(request('/api/community/register', { nickname: 'Test', ...data }, proof))).status).toBe(400);
    expect(await setupFromCookie(proof)).not.toBeNull();
  });
  it('does not allow an ordinary logged-in session to change the password', async () => {
    const registered = await signUp();
    expect((await register(request('/api/community/register', { password, confirmPassword: password }, cookies(registered)))).status).toBe(401);
  });
  it('resets only after fresh app proof, revokes old sessions and preserves the name', async () => {
    const registered = await signUp(); const oldSession = cookies(registered);
    const proof = cookies((await appEntry()).response);
    const replacement = password + ' changed';
    const response = await register(request('/api/community/register', { nickname: 'Impersonator', password: replacement, confirmPassword: replacement }, proof));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ next: '/community?password=updated' });
    expect(await memberFromCookie(oldSession)).toBeNull();
    expect((await memberFromCookie(cookies(response)))?.nickname).toBe('Member.Test');
    expect((await login(request('/api/community/login', { nickname: 'Member.Test', password }))).status).toBe(401);
    expect((await login(request('/api/community/login', { nickname: 'Member.Test', password: replacement }))).status).toBe(200);
    expect((await register(request('/api/community/register', { password, confirmPassword: password }, proof))).status).toBe(401);
  });
  it('rejects duplicate names irrespective of case and permits a different name', async () => {
    await signUp(); const proof = cookies((await appEntry('second-user')).response);
    expect((await register(request('/api/community/register', { nickname: 'Member.Test', password, confirmPassword: password }, proof))).status).toBe(409);
    expect((await register(request('/api/community/register', { nickname: 'OtherName', password, confirmPassword: password }, proof))).status).toBe(200);
  });
  it('blocks suspended members from sessions, password login and app entry', async () => {
    const registered = await signUp();
    sqlite.exec("UPDATE community_members SET suspended_at='2026-09-16'");
    expect(await memberFromCookie(cookies(registered))).toBeNull();
    expect((await login(request('/api/community/login', { nickname: 'Member.Test', password }))).status).toBe(401);
    expect((await appEntry()).response.headers.get('location')).toContain('unavailable');
  });
  it('limits repeated login attempts and does not reveal whether a name exists', async () => {
    for (let i = 0; i < 10; i++) expect((await login(request('/api/community/login', { nickname: 'Nobody', password }))).status).toBe(401);
    expect((await login(request('/api/community/login', { nickname: 'Nobody', password }))).status).toBe(429);
    sqlite.exec('UPDATE community_auth_limits SET expires_at=0');
    expect(await rateLimit('login-name:nobody', 10)).toBe(true);
  });
  it('rejects sessions issued for a password that was already replaced', async () => {
    await signUp();
    expect(await createSession('private-account-identifier', hashPassword('obsolete password'))).toBeNull();
  });
  it('uses different salts for the same password and rejects incorrect passwords', () => {
    const one = hashPassword(password), two = hashPassword(password);
    expect(one).not.toBe(two);
    expect(verifyPassword(password, one)).toBe(true);
    expect(verifyPassword(password + 'wrong', one)).toBe(false);
    expect(verifyPassword(password, null)).toBe(false);
  });
});
