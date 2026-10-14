'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { useState } from 'react';
import { useI18n } from '@/components/i18n-provider';

const endpoint = 'https://your-project.supabase.co/functions/v1/delete-account';

export function DeletionForm() {
  const { t } = useI18n();
  const [nevulaId, setNevulaId] = useState('');
  const [deletionCode, setDeletionCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const idReady = nevulaId.trim().length > 0;
  const keyReady = deletionCode.trim().length > 0;
  const canContinue = idReady && keyReady;

  const erase = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'external', nevulaId, deletionCode }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || t.delete.fail);
      setMessage(t.delete.success);
      setNevulaId('');
      setDeletionCode('');
      setConfirming(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.delete.unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="deleteForm formSection">
      <h2>{t.delete.formTitle}</h2>
      <p>{t.delete.formLead}</p>
      <label>
        {t.delete.id}
        <input
          value={nevulaId}
          onChange={(event) => setNevulaId(event.target.value.toUpperCase())}
          placeholder="NVL-___-___-____"
          autoComplete="off"
        />
      </label>
      <label>
        {t.delete.key}
        <input
          value={deletionCode}
          onChange={(event) => setDeletionCode(event.target.value.toUpperCase())}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          autoComplete="off"
        />
      </label>
      {confirming ? (
        <div className="deleteConfirm">
          <strong>{t.delete.confirmTitle}</strong>
          <p className="deleteWarn">{t.delete.confirmWarn}</p>
          <button className="btnDanger" disabled={busy} onClick={erase}>
            {busy ? t.delete.deleting : t.delete.confirmYes}
          </button>
          <button
            className="cancelDelete btnSecondary"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {t.delete.cancel}
          </button>
        </div>
      ) : (
        <>
          <button
            className="btnDanger"
            disabled={!canContinue}
            onClick={() => setConfirming(true)}
            aria-describedby="delete-disabled-hint"
          >
            {t.delete.continue}
          </button>
          <p id="delete-disabled-hint" className="formHint" role="status">
            {!canContinue
              ? !idReady && !keyReady
                ? t.delete.hintBoth
                : !idReady
                  ? t.delete.hintId
                  : t.delete.hintKey
              : t.delete.hintNext}
          </p>
        </>
      )}
      {message ? <output className="formMessage">{message}</output> : null}
    </section>
  );
}
