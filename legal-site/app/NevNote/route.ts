import { env } from 'cloudflare:workers';

/** Standalone document: no site layout, locale bootstrap, cookies or third-party assets. */
export function GET(request: Request) {
  const settings = env as Record<string, unknown>;
  const setting = (name: string) => String(settings[name] ?? process.env[name] ?? '');
  const expectedEndpoint = 'https://uconzawmkrxmcudxbukp.supabase.co/functions/v1/nevnote';
  let endpoint = setting('NEVULA_NEVNOTE_ENDPOINT') || expectedEndpoint;
  let key = setting('NEVULA_NEVNOTE_PUBLIC_KEY');
  try {
    // Exposure guard, not JWT authentication: the Supabase gateway validates the signature.
    // Only the intended project's public anon JWT may be sent to a browser.
    if (endpoint !== expectedEndpoint || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid configuration');
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role !== 'anon' || payload.ref !== 'uconzawmkrxmcudxbukp' ||
      !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error('Invalid public key');
  } catch { endpoint = ''; key = ''; }
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const connect = endpoint || "'none'";
  const csp = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src ${connect}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><meta name="nevnote-endpoint" content="${escape(endpoint)}"><meta name="nevnote-public-key" content="${escape(key)}"><title>NevNote · NEVULA</title><link rel="stylesheet" href="/NevNote/reader.css"><script type="module" src="/NevNote/reader.js"></script></head><body><header>NEVULA</header><main><section class="card" aria-label="NevNote"><picture><source media="(prefers-color-scheme: light)" srcset="/NevNote/badge-light.png"><img src="/NevNote/badge-dark.png" alt="NevNote" width="154" height="47"></picture><div id="content" aria-live="polite"><p>Read once. No account needed.</p><p class="hint">Opening this note permanently removes it from the server.</p><button id="open" disabled>Open</button><noscript><p>JavaScript is required to decrypt this note in your browser.</p></noscript></div></section></main></body></html>`, {
    status: endpoint ? 200 : 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0',
      'content-security-policy': csp, 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY', 'x-robots-tag': 'noindex, nofollow, noarchive',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()' },
  });
}
