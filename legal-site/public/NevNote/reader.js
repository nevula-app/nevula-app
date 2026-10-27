// NevNote v1. No network request until the reader explicitly chooses Open.
const fields = ['v', 'id', 'key', 'readToken', 'expiresAt', 'mode', 'durationSeconds'];
const secret = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const bytes = hex => Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
export function parseFragment(hash) {
  if (typeof hash !== 'string' || hash.length > 4096 || !hash.startsWith('#')) throw new Error('Invalid link');
  const r = JSON.parse(decodeURIComponent(hash.slice(1)));
  if (!r || r.v !== 1 || !secret(r.id) || !secret(r.key) || !secret(r.readToken) ||
    new Set([r.id, r.key, r.readToken]).size !== 3 || r.mode !== 'link' || r.durationSeconds !== 0 ||
    typeof r.expiresAt !== 'string' || !Number.isFinite(Date.parse(r.expiresAt)) ||
    new Date(r.expiresAt).toISOString() !== r.expiresAt || Object.keys(r).some(k => !fields.includes(k))) throw new Error('Invalid link');
  return r;
}
export async function decryptEnvelope(envelope, ref, webCrypto = globalThis.crypto) {
  if (!envelope || !/^[0-9a-f]{24}$/.test(envelope.nonce) || typeof envelope.ciphertext !== 'string' ||
    !/^[0-9a-f]+$/.test(envelope.ciphertext) || ![256, 1024, 4096, 16384].some(b => envelope.ciphertext.length === (b + 16) * 2)) throw new Error('Invalid envelope');
  const key = await webCrypto.subtle.importKey('raw', bytes(ref.key), 'AES-GCM', false, ['decrypt']);
  const aad = new TextEncoder().encode(JSON.stringify(['NEVULA-NevNote', ref.v, ref.id, ref.expiresAt, ref.mode, ref.durationSeconds]));
  const plain = new Uint8Array(await webCrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.nonce), additionalData: aad, tagLength: 128 }, key, bytes(envelope.ciphertext)));
  try {
    const length = new DataView(plain.buffer).getUint32(0, false);
    if (length < 1 || length > plain.length - 4) throw new Error('Invalid padding');
    return new TextDecoder('utf-8', { fatal: true }).decode(plain.subarray(4, 4 + length));
  } finally { plain.fill(0); }
}
const unavailable = { title: 'This note is no longer available', hint: 'It may have expired, been read or been deleted.' };
const destroyed = { title: 'This note has been destroyed', hint: 'It cannot be opened again.' };
const failed = { title: 'The note could not be displayed', hint: 'The connection was interrupted or the note could not be decrypted. The note may already have been destroyed.' };
/** One attempt only. Lifecycle changes invalidate even an in-flight result. */
export function createReader(ref, endpoint, publicKey, { fetcher = globalThis.fetch, render, now = Date.now, webCrypto = globalThis.crypto }) {
  let state = 'ready';
  let reference = ref;
  const destroy = () => { if (state !== 'opening' && state !== 'opened') return; state = 'destroyed'; reference = null; render({ state, ...destroyed }); };
  return {
    state: () => state,
    destroy,
    async open() {
      if (state !== 'ready') return;
      if (Date.parse(reference.expiresAt) <= now()) { state = 'unavailable'; reference = null; render({ state, ...unavailable }); return; }
      state = 'opening'; render({ state, title: 'Opening…', hint: 'Please wait.' });
      let plaintext;
      const current = reference;
      try {
        const response = await fetcher(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', apikey: publicKey },
          body: JSON.stringify({ operation: 'consume', id: current.id, readToken: current.readToken }),
          credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (state !== 'opening') return;
        if (response.status === 404 || response.status === 410) { state = 'unavailable'; render({ state, ...unavailable }); return; }
        if (!response.ok) throw new Error('Request failed');
        plaintext = await decryptEnvelope(await response.json(), current, webCrypto);
        if (state !== 'opening') return;
        state = 'opened'; render({ state, text: plaintext, hint: 'This note cannot be opened again.' });
      } catch {
        if (state === 'opening') { state = 'failed'; render({ state, ...failed }); }
      } finally { reference = null; plaintext = undefined; }
    },
  };
}
export function mountReader(doc = document, win = window) {
  const content = doc.getElementById('content');
  const render = value => {
    content.replaceChildren();
    const text = doc.createElement('p'); text.textContent = value.text ?? value.title;
    if (value.state === 'opened') text.className = 'secret';
    const hint = doc.createElement('p'); hint.className = 'hint'; hint.textContent = value.hint;
    content.append(text, hint);
    if (value.state === 'opened') { const close = doc.createElement('button'); close.textContent = 'Close'; close.className = 'outline'; close.onclick = () => controller.destroy(); content.append(close); }
  };
  let reference;
  try {
    reference = parseFragment(win.location.hash);
    // Keep capabilities out of the address bar and back/forward history for this entry.
    win.history.replaceState(null, '', win.location.pathname);
  } catch {
    win.history.replaceState(null, '', win.location.pathname);
    render({ title: 'This link is invalid or incomplete', hint: 'Ask the sender for the complete link.' }); return;
  }
  const endpoint = doc.querySelector('meta[name="nevnote-endpoint"]').content;
  const key = doc.querySelector('meta[name="nevnote-public-key"]').content;
  if (!endpoint || !win.isSecureContext || !win.crypto?.subtle) { reference = null; render({ title: 'NevNote is unavailable', hint: 'This browser or service is not ready. Please try again later.' }); return; }
  const controller = createReader(reference, endpoint, key, { render }); reference = null;
  const open = doc.getElementById('open'); open.disabled = false; open.onclick = () => { void controller.open(); };
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) controller.destroy(); });
  win.addEventListener('pagehide', () => controller.destroy());
  win.addEventListener('pageshow', event => { if (event.persisted) controller.destroy(); });
  win.addEventListener('popstate', () => controller.destroy());
}
if (typeof document !== 'undefined') mountReader();
