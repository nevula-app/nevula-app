'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  INVITE_TOKEN_RE,
  contactInviteIntentUrl,
  contactInviteOpenUrl,
  contactInviteUrl,
  parseContactInvite,
  playInstallUrlForInvite,
} from '@/lib/contact-invite';

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Browser never resolves the invite envelope. It only preserves the hash token
 * for deep-link handoff. No personal names, imprint, or third-party labels here.
 */
export function InviteClient() {
  const [token, setToken] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [android, setAndroid] = useState(false);
  const autoTried = useRef(false);

  useEffect(() => {
    setAndroid(isAndroid());
  }, []);

  useEffect(() => {
    const read = () => {
      const fromHash = window.location.hash.slice(1);
      if (INVITE_TOKEN_RE.test(fromHash)) {
        setToken(fromHash);
        return;
      }
      setToken(parseContactInvite(window.location.href));
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const webUrl = useMemo(() => (token ? contactInviteUrl(token, false) : null), [token]);
  const openUrl = useMemo(() => (token ? contactInviteOpenUrl(token) : null), [token]);
  const intentUrl = useMemo(() => (token ? contactInviteIntentUrl(token) : null), [token]);
  const playUrl = useMemo(() => playInstallUrlForInvite(token), [token]);
  const launchHref = android ? intentUrl ?? openUrl : openUrl;
  const tokenHint = token ? `${token.slice(0, 8)}…${token.slice(-8)}` : null;

  const markOpening = () => {
    setOpening(true);
    window.setTimeout(() => setOpening(false), 2800);
  };

  useEffect(() => {
    if (!token || !openUrl || !isAndroid() || autoTried.current) return;
    autoTried.current = true;
    const timer = window.setTimeout(() => {
      markOpening();
      window.location.href = openUrl;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [token, openUrl]);

  if (!token || !webUrl || !openUrl || !launchHref) {
    return (
      <div className="invite-hero invite-sterile-hero">
        <p className="invite-code muted">—</p>
        <a className="button-secondary" href={playInstallUrlForInvite(null)}>
          Install
        </a>
      </div>
    );
  }

  return (
    <div className="invite-hero invite-sterile-hero">
      <p className="invite-code" aria-label="invite id">
        {tokenHint}
      </p>
      <div className="invite-actions">
        <a
          className="button-primary invite-open"
          href={launchHref}
          onClick={markOpening}
          aria-busy={opening}
        >
          <span>{opening ? '…' : 'Open'}</span>
        </a>
        <a className="button-secondary" href={playUrl}>
          Install
        </a>
      </div>
    </div>
  );
}
