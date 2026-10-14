// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/** Public capability only: never put identity fields in this URL. */
export const INVITE_ORIGIN = 'https://nevula.de';
export const INVITE_TOKEN_RE = /^[a-f0-9]{64}$/;
export const PLAY_INSTALL_URL = 'https://play.google.com/store/apps/details?id=com.nevula.app';

function tokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/invite(?:\/([a-f0-9]{64}))?$/);
  if (!match) return null;
  return match[1] && INVITE_TOKEN_RE.test(match[1]) ? match[1] : null;
}

export function parseContactInvite(raw: string): string | null {
  if (raw.length > 320) return null;
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password || url.port || url.search) return null;

    const web = url.origin === INVITE_ORIGIN;
    const app = url.protocol === 'nevula:' && url.hostname === 'invite';
    if (!web && !app) return null;

    const hash = url.hash.slice(1);
    if (INVITE_TOKEN_RE.test(hash)) return hash;

    if (web) {
      const fromPath = tokenFromPath(url.pathname);
      if (fromPath) return fromPath;
      if (url.pathname === '/invite' || url.pathname === '/invite/') return null;
      return null;
    }

    // nevula://invite/<token> or nevula://invite#<token>
    const pathToken = url.pathname.replace(/^\//, '');
    if (INVITE_TOKEN_RE.test(pathToken)) return pathToken;
    return null;
  } catch {
    return null;
  }
}

/** Web / QR link — token stays in the hash so it is not sent in server path logs. */
export function contactInviteUrl(token: string, app = false): string {
  if (!INVITE_TOKEN_RE.test(token)) throw new Error('Invalid contact invitation.');
  return `${app ? 'nevula://invite' : `${INVITE_ORIGIN}/invite`}#${token}`;
}

/**
 * Open-installed-app link. Uses a path token because Android often drops URL
 * fragments when handing https / custom-scheme intents to an app.
 */
export function contactInviteOpenUrl(token: string): string {
  if (!INVITE_TOKEN_RE.test(token)) throw new Error('Invalid contact invitation.');
  return `nevula://invite/${token}`;
}

/**
 * Chrome/Android Intent URL. Prefer path tokens (Android drops URL fragments).
 * No Play Store fallback here — a missing app stays on the invite page where
 * Install is already visible. That avoids bouncing installed users to Play when
 * the handoff is slow.
 */
export function contactInviteIntentUrl(token: string): string {
  if (!INVITE_TOKEN_RE.test(token)) throw new Error('Invalid contact invitation.');
  return `intent://invite/${token}#Intent;scheme=nevula;package=com.nevula.app;end`;
}

/**
 * Best-effort Play Store URL that embeds the invite token in the install referrer.
 * Android does not guarantee the app receives this after install. Primary return path:
 * reopen https://nevula.de/invite#<token> (App Link) or scan the QR again.
 */
export function playInstallUrlForInvite(token?: string | null): string {
  if (!token || !INVITE_TOKEN_RE.test(token)) return PLAY_INSTALL_URL;
  const referrer = encodeURIComponent(`utm_source=nevula_invite&invite=${token}`);
  return `${PLAY_INSTALL_URL}&referrer=${referrer}`;
}
