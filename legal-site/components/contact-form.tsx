'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { type SubmitEvent, useState } from 'react';
import { useI18n } from '@/components/i18n-provider';

export function ContactForm() {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const ready =
    name.trim().length > 0 && email.trim().length > 0 && message.trim().length >= 10;

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) {
      setStatus(t.support.hintRequired);
      return;
    }
    setBusy(true);
    setStatus('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          subject: data.get('subject'),
          message: data.get('message'),
          website: data.get('website'),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || t.support.sendUnavailable);
      form.reset();
      setName('');
      setEmail('');
      setMessage('');
      setStatus(t.support.success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t.support.sendUnavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="contactForm" onSubmit={submit} noValidate>
      <label>
        {t.support.name}
        <input
          name="name"
          maxLength={80}
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        {t.support.email}
        <input
          name="email"
          type="email"
          maxLength={160}
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        {t.support.subject}
        <select name="subject" defaultValue={t.support.subjects[0]}>
          {t.support.subjects.map((subject) => (
            <option key={subject}>{subject}</option>
          ))}
        </select>
      </label>
      <label>
        {t.support.message}
        <textarea
          name="message"
          minLength={10}
          maxLength={5000}
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <label className="contactTrap" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <p>{t.support.warn}</p>
      <button className="btnPrimary" disabled={busy || !ready} aria-describedby="contact-hint">
        {busy ? t.support.sending : t.support.send}
      </button>
      {!ready && !busy ? (
        <p id="contact-hint" className="formHint" role="status">
          {message.trim().length > 0 && message.trim().length < 10
            ? t.support.hintShort
            : t.support.hintRequired}
        </p>
      ) : (
        <p id="contact-hint" className="formHint visuallyHidden">
          ok
        </p>
      )}
      {status ? <output className="formMessage">{status}</output> : null}
    </form>
  );
}
