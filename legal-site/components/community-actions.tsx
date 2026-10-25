// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

'use client';
import { SubmitEvent, useState } from 'react';
import { useI18n } from '@/components/i18n-provider';

async function send<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}

export function NewPostForm({
  nickname,
  category = 'question',
  isAdmin = false,
}: {
  nickname: string;
  category?: string;
  isAdmin?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await send<{ id: string; previewPath?: string | null }>('/api/community/posts', {
        category: form.get('category'),
        title: form.get('title'),
        body: form.get('body'),
        status: form.get('status') === 'draft' ? 'draft' : 'published',
        pinned: form.get('pinned') === 'on',
      });
      location.href = result.previewPath || `/community/questions/${result.id}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bitte erneut versuchen.');
      setBusy(false);
    }
  };
  return (
    <form className="communityForm" onSubmit={submit}>
      <label>
        Community-Nickname
        <input value={nickname} readOnly aria-readonly="true" />
      </label>
      <label>
        Kategorie
        <select name="category" defaultValue={category}>
          <option value="bug">Bugs & Fehler</option>
          <option value="question">Community-Fragen</option>
          <option value="idea">Verbesserungsvorschläge</option>
          {isAdmin && <option value="announcement">Announcement</option>}
        </select>
      </label>
      <label>
        Titel
        <input name="title" minLength={5} maxLength={120} required />
      </label>
      <label>
        Öffentlicher Beitrag
        <textarea name="body" minLength={10} maxLength={5000} required />
      </label>
      {isAdmin && (
        <>
          <label>
            Status
            <select name="status" defaultValue="published">
              <option value="published">Veröffentlicht</option>
              <option value="draft">Entwurf (nicht öffentlich)</option>
            </select>
          </label>
          <label>
            <input name="pinned" type="checkbox" /> Angepinnt (oben in der Liste)
          </label>
        </>
      )}
      <p className="publicWarning">
        Öffentliches Forum: Keine privaten Chats, Kontaktdaten, Zugangscodes oder Schlüssel
        veröffentlichen.
      </p>
      <button disabled={busy}>{busy ? 'Wird veröffentlicht …' : 'Beitrag veröffentlichen'}</button>
      {message && <p className="formMessage">{message}</p>}
    </form>
  );
}

export function ReplyForm({ postId }: { postId: string }) {
  const [message, setMessage] = useState('');
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await send('/api/community/replies', { postId, body: form.get('body') });
      location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  };
  return (
    <form className="communityForm compact" onSubmit={submit}>
      <label>
        Your public reply
        <textarea name="body" minLength={2} maxLength={3000} required />
      </label>
      <button>Post reply</button>
      {message && <p className="formMessage">{message}</p>}
    </form>
  );
}

export function ReportButton({ postId, replyId }: { postId?: string; replyId?: string }) {
  const report = async () => {
    const reason = prompt('Why should this content be reviewed?');
    if (!reason) return;
    try {
      await send('/api/community/reports', { postId, replyId, reason });
      alert('Thank you. The report was submitted.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Please try again.');
    }
  };
  return (
    <button className="reportButton" onClick={report}>
      Report
    </button>
  );
}

export function DiscussionFooter({
  postId,
  canReply,
  locked,
  published,
  isAdminMember,
}: {
  postId: string;
  canReply: boolean;
  locked: boolean;
  published: boolean;
  isAdminMember: boolean;
}) {
  const { t } = useI18n();

  if (canReply) return <ReplyForm postId={postId} />;
  if (locked) {
    return (
      <div className="guestReplyPrompt">
        <p>{t.community.discussionLocked}</p>
      </div>
    );
  }
  if (!published) {
    return (
      <div className="guestReplyPrompt">
        <p>{isAdminMember ? t.community.draftNoReplies : t.community.notPublicYet}</p>
      </div>
    );
  }
  return (
    <div className="guestReplyPrompt">
      <p>{t.community.loginToReply}</p>
      <div className="emptyCommunityActions">
        <a className="secondaryLink btnSecondary" href="/community/login">
          {t.community.login}
        </a>
        <a className="primaryLink btnPrimary" href="/community/register">
          {t.community.createAccess}
        </a>
      </div>
    </div>
  );
}
