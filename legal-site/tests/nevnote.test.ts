import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createReader, decryptEnvelope, mountReader, parseFragment } from '../public/NevNote/reader.js';

function evaluate(source: string, modules: Record<string, unknown>) {
  const module = { exports: {} as any };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: (id: string) => modules[id],
    crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, DataView, Date, URL, Response, Headers, atob,
    process: { env: {} } });
  return module.exports;
}
// Cross-runtime vectors use the actual Android protocol/crypto, rather than a duplicate encoder.
const appRoot = process.env.NEVNOTE_APP_ROOT;
if (!appRoot) throw new Error('Set NEVNOTE_APP_ROOT to the Play checkout for interoperability tests');
const protocol = evaluate(readFileSync(`${appRoot}/src/nevnote/protocol.ts`, 'utf8'), {});
const appCrypto = evaluate(readFileSync(`${appRoot}/src/nevnote/crypto.ts`, 'utf8'), { './protocol': protocol });
const ref = () => ({ v: 1, ...appCrypto.newSecrets(), mode: 'link', durationSeconds: 0,
  expiresAt: new Date(Date.now() + 86400000).toISOString() });
const endpoint = 'https://uconzawmkrxmcudxbukp.supabase.co/functions/v1/nevnote';
// Deliberately unsigned fixture, never usable as a real Supabase credential.
const anonFixture = (role = 'anon', project = 'uconzawmkrxmcudxbukp') => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role, ref: project, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url'),
  'unsigned',
].join('.');

test('Android links put every secret and the id in the fragment; the browser accepts the same reference', () => {
  const r = ref(), link = protocol.noteLink(r);
  assert.equal(link.split('#')[0], 'https://nevula.de/NevNote');
  assert.deepEqual(JSON.parse(JSON.stringify(parseFragment(new URL(link).hash))), r);
  for (const invalid of ['', '#broken', '#' + encodeURIComponent(JSON.stringify({ ...r, durationSeconds: 30 })),
    '#' + encodeURIComponent(JSON.stringify({ ...r, key: r.readToken })),
    '#' + encodeURIComponent(JSON.stringify({ ...r, extra: true }))]) assert.throws(() => parseFragment(invalid));
});

for (const ttl of [86400, 172800, 259200, 604800]) test(`Android AES-GCM/padding -> browser, TTL ${ttl}, no automatic or repeated fetch`, async () => {
  const r = { ...ref(), expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  const text = 'Meet me at the north gate.\nÄÖÜ 🔐 <script>alert(1)</script>';
  const envelope = await appCrypto.encryptNote(text, r);
  assert.equal(await decryptEnvelope(envelope, r), text);
  let calls = 0; const views: any[] = [];
  const reader = createReader(r, endpoint, 'public', {
    render: (v: unknown) => views.push(v), fetcher: async (_url: unknown, options: any) => {
      calls++; const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ['id', 'operation', 'readToken']);
      assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(JSON.stringify(body).includes(r.key), false);
      return Response.json(envelope);
    },
  });
  assert.equal(calls, 0);
  await Promise.all([reader.open(), reader.open()]);
  assert.equal(calls, 1); assert.equal(views.at(-1).text, text);
  reader.destroy(); await reader.open();
  assert.equal(calls, 1); assert.equal(views.at(-1).title, 'This note has been destroyed');
  assert.equal(views.at(-1).text, undefined);
});

test('authentication rejects ciphertext, key and expiry manipulation', async () => {
  const r = ref(), envelope = await appCrypto.encryptNote('protected', r);
  for (const change of [{ key: appCrypto.newSecrets().key }, { expiresAt: new Date(Date.now() + 3600000).toISOString() }]) {
    await assert.rejects(decryptEnvelope(envelope, { ...r, ...change }));
  }
  await assert.rejects(decryptEnvelope({ ...envelope, ciphertext: (envelope.ciphertext[0] === '0' ? '1' : '0') + envelope.ciphertext.slice(1) }, r));
});

test('parallel browser readers have one winner when the atomic server consumes once', async () => {
  const r = ref(), envelope = await appCrypto.encryptNote('one winner', r);
  let spent = false; const views = [[], []] as any[][];
  const fetcher = async () => { if (spent) return new Response(null, { status: 410 }); spent = true; return Response.json(envelope); };
  const readers = views.map(view => createReader(r, endpoint, '', { fetcher, render: (v: unknown) => view.push(v) }));
  await Promise.all(readers.map(reader => reader.open()));
  assert.equal(readers.filter(reader => reader.state() === 'opened').length, 1);
  assert.equal(readers.filter(reader => reader.state() === 'unavailable').length, 1);
});

test('network failure after consumption never retries', async () => {
  let calls = 0; const views: any[] = [];
  const reader = createReader(ref(), endpoint, '', { render: (v: unknown) => views.push(v),
    fetcher: async () => { calls++; throw new Error('response lost after consumption'); } });
  await reader.open(); await reader.open();
  assert.equal(calls, 1); assert.equal(reader.state(), 'failed');
  assert.match(views.at(-1).hint, /may already have been destroyed/);
});

test('close/background/pagehide during a request discards the late plaintext', async () => {
  const r = ref(), envelope = await appCrypto.encryptNote('must never render', r);
  let resolve!: (response: Response) => void; const views: any[] = [];
  const reader = createReader(r, endpoint, '', { render: (v: unknown) => views.push(v),
    fetcher: () => new Promise<Response>(done => { resolve = done; }) });
  const pending = reader.open(); reader.destroy(); resolve(Response.json(envelope)); await pending;
  assert.equal(reader.state(), 'destroyed'); assert.equal(views.some(v => v.text), false);
});

test('expired links and already consumed notes share a clear unavailable state', async () => {
  let calls = 0; const views: any[] = [];
  const fetcher = async () => { calls++; return new Response(null, { status: 410 }); };
  const expired = createReader({ ...ref(), expiresAt: '2020-01-01T00:00:00.000Z' }, endpoint, '', { fetcher, render: (v: unknown) => views.push(v) });
  await expired.open(); assert.equal(calls, 0);
  const consumed = createReader(ref(), endpoint, '', { fetcher, render: (v: unknown) => views.push(v) });
  await consumed.open(); assert.equal(calls, 1);
  assert.equal(views[0].title, views.at(-1).title);
});

test('standalone HTML has restrictive headers, English content and no external scripts', async () => {
  const api = evaluate(readFileSync('app/NevNote/route.ts', 'utf8'), { 'cloudflare:workers': { env: {
    NEVULA_NEVNOTE_ENDPOINT: endpoint, NEVULA_NEVNOTE_PUBLIC_KEY: anonFixture(),
  } } });
  const response = api.GET(new Request('https://nevula.de/NevNote'));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<button id="open" disabled>Open<\/button>/);
  assert.match(html, /Opening this note permanently removes it from the server\./);
  assert.equal((html.match(/No account needed/g) ?? []).length, 1);
  assert.equal(/class="status"|Revealing|Reveal/.test(html), false);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(/<script[^>]+src="https?:/.test(html), false);
  assert.equal(html.includes('localStorage'), false);
});

test('production configuration rejects privileged keys, wrong projects, endpoints and missing configuration', async () => {
  const source = readFileSync('app/NevNote/route.ts', 'utf8');
  for (const [url, key] of [
    [endpoint, anonFixture('service_role')], [endpoint, anonFixture('anon', 'different-project')],
    [endpoint, 'sb_secret_invalid'], [endpoint, ''], [endpoint.replace('https:', 'http:'), anonFixture()],
    [endpoint + '?unsafe=1', anonFixture()], [endpoint.replace('/nevnote', '/other'), anonFixture()],
    [endpoint, '"><script>unsafe</script>'],
  ]) {
    const api = evaluate(source, { 'cloudflare:workers': { env: { NEVULA_NEVNOTE_ENDPOINT: url, NEVULA_NEVNOTE_PUBLIC_KEY: key } } });
    const response = api.GET(new Request('https://nevula.de/NevNote'));
    const html = await response.text();
    assert.equal(response.status, 503); assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
    if (key) assert.equal(html.includes(key), false);
    assert.match(html, /name="nevnote-public-key" content=""/);
  }
  for (const file of ['app/NevNote/route.ts', 'public/NevNote/reader.js', 'public/NevNote/reader.css']) {
    assert.equal(/localhost|127\.0\.0\.1|example\.test|http:\/\//i.test(readFileSync(file, 'utf8')), false);
  }
});

test('locale middleware bypass is restricted to NevNote', () => {
  let cookies = 0;
  const api = evaluate(readFileSync('middleware.ts', 'utf8'), {
    'next/server': { NextResponse: { next: () => ({ cookies: { set: () => cookies++ } }) } },
    '@/lib/i18n': { isLocale: (v: unknown) => v === 'en' || v === 'de' },
  });
  const request = (path: string) => ({ nextUrl: new URL(`https://nevula.de${path}`), cookies: { get: () => null }, headers: new Headers() });
  api.middleware(request('/NevNote')); api.middleware(request('/NevNote/reader.js')); assert.equal(cookies, 0);
  api.middleware(request('/')); assert.equal(cookies, 1);
});

test('Open renders only plaintext in the message box and Close removes it', { timeout: 5000 }, async () => {
  const r = ref(), plaintext = 'Meet me at the north gate.\n<script>not executable</script>';
  const envelope = await appCrypto.encryptNote(plaintext, r);
  let opened!: () => void;
  const displayed = new Promise<void>(resolve => { opened = resolve; });
  class Element {
    children: Element[] = [];
    textContent = '';
    className = '';
    disabled = true;
    onclick: (() => void) | null = null;
    tag: string;
    constructor(tag: string) { this.tag = tag; }
    append(...children: Element[]) {
      this.children.push(...children);
      if (children.some(child => child.tag === 'button' && child.textContent === 'Close')) opened();
    }
    replaceChildren() { this.children = []; }
  }
  const content = new Element('div'), button = new Element('button');
  const doc = { getElementById: (id: string) => id === 'content' ? content : id === 'open' ? button : null,
    createElement: (tag: string) => new Element(tag), addEventListener: () => {},
    querySelector: (selector: string) => ({ content: selector.includes('endpoint') ? endpoint : anonFixture() }) };
  let cleared = '', calls = 0;
  const win = { location: { hash: '#' + encodeURIComponent(JSON.stringify(r)), pathname: '/NevNote' },
    history: { replaceState: (_state: unknown, _title: string, url: string) => { cleared = url; } },
    isSecureContext: true, crypto: globalThis.crypto, addEventListener: () => {} };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => { calls++; return Response.json(envelope); }) as typeof fetch;
  try {
    mountReader(doc as any, win as any);
    assert.equal(cleared, '/NevNote'); assert.equal(button.disabled, false); assert.equal(calls, 0);
    button.onclick!(); await displayed;
    const message = content.children.find(child => child.className === 'secret')!;
    assert.equal(message.textContent, plaintext); assert.equal(message.children.length, 0); assert.equal(calls, 1);
    content.children.find(child => child.tag === 'button')!.onclick!();
    assert.equal(content.children.some(child => child.className === 'secret'), false);
    assert.equal(content.children[0].textContent, 'This note has been destroyed');
  } finally { globalThis.fetch = previousFetch; }
});
