'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useState, type SubmitEvent } from 'react';
import { useI18n } from '@/components/i18n-provider';

export function CommunityAuthForm({
  mode,
  nickname = '',
}: {
  mode: 'login' | 'register' | 'reset';
  nickname?: string;
}) {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = mode !== 'login';

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/community/' + (setup ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nickname: form.get('nickname'),
          password: form.get('password'),
          confirmPassword: form.get('confirmPassword'),
        }),
      });
      const result = (await response.json()) as { error?: string; next?: string };
      if (!response.ok) throw new Error(result.error ?? t.auth.retry);
      window.location.assign(result.next ?? '/community');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.auth.retry);
      setBusy(false);
    }
  }

  const submitLabel =
    mode === 'login'
      ? t.login.submit
      : mode === 'reset'
        ? t.password.submit
        : t.register.submit;

  return (
    <form className="communityForm authForm" onSubmit={submit} aria-busy={busy}>
      <label>
        {t.login.name}
        <input
          name="nickname"
          autoComplete="username"
          defaultValue={nickname}
          readOnly={mode === 'reset'}
          minLength={3}
          maxLength={30}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,29}"
          aria-describedby={mode === 'register' ? 'name-help' : undefined}
        />
      </label>
      {mode === 'register' && (
        <p id="name-help" className="authHint">
          {t.register.nameHelp}
        </p>
      )}
      <label>
        {t.login.password}
        <input
          name="password"
          type="password"
          autoComplete={setup ? 'new-password' : 'current-password'}
          minLength={15}
          maxLength={128}
          required
          aria-describedby={setup ? 'password-help' : undefined}
        />
      </label>
      {setup && (
        <>
          <p id="password-help" className="authHint">
            {t.register.passwordHelp}
          </p>
          <label>
            {t.register.confirmPassword}
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      {error && (
        <p className="formMessage" role="alert">
          {error}
        </p>
      )}
      <button className="btnPrimary" disabled={busy}>
        {busy ? t.auth.busy : submitLabel}
      </button>
      {mode === 'login' && (
        <p className="authFormLinks">
          <a href="/community/register">{t.auth.noAccessLink}</a>
          {' · '}
          <a href="/community/password">{t.auth.forgot}</a>
        </p>
      )}
    </form>
  );
}

export function CommunityLogout() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/community/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(t.auth.logoutFail);
      window.location.assign('/community');
    } catch {
      setError(t.auth.logoutFail);
      setBusy(false);
    }
  }

  return (
    <>
      <button className="secondaryLink" onClick={logout} disabled={busy}>
        {busy ? t.auth.loggingOut : t.auth.logout}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
