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

export function CopyAddressButton({ address }: { address: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="copyAddressBtn btnSecondary" onClick={onCopy}>
      {copied ? t.contribute.copied : t.contribute.copyAddress}
    </button>
  );
}
