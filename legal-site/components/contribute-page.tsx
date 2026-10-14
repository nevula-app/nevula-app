'use client';

// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import Image from 'next/image';
import { DocumentPage } from '@/components/site-shell';
import { CopyAddressButton } from '@/components/copy-address-button';
import { useI18n } from '@/components/i18n-provider';
import { DONATE_BTC, DONATE_BTC_QR } from '@/lib/donate';

function CryptoBlock({
  title,
  address,
  qrSrc,
  qrAlt,
}: {
  title: string;
  address: string;
  qrSrc: string;
  qrAlt: string;
}) {
  return (
    <div className="donateCrypto">
      <h3>{title}</h3>
      <div className="donateQrWrap">
        <Image src={qrSrc} alt={qrAlt} width={280} height={280} unoptimized className="donateQr" />
      </div>
      <p className="donateAddress" lang="en">
        {address}
      </p>
      <CopyAddressButton address={address} />
    </div>
  );
}

export default function ContributePageView() {
  const { t } = useI18n();
  return (
    <DocumentPage eyebrow={t.contribute.kicker} title={t.contribute.title} intro={t.contribute.p1}>
      <section className="donateIntro">
        <p>{t.contribute.p2}</p>
        <p>{t.contribute.p3}</p>
        <p>{t.contribute.p4}</p>
      </section>
      <section className="donateCryptoSection">
        <h2>{t.contribute.cryptoTitle}</h2>
        <p>{t.contribute.cryptoLead}</p>
        <div className="donateCryptoGrid">
          <CryptoBlock
            title={t.contribute.btcTitle}
            address={DONATE_BTC}
            qrSrc={DONATE_BTC_QR}
            qrAlt={t.contribute.btcQrAlt}
          />
        </div>
      </section>
      <p className="donateThanks">{t.contribute.thanks}</p>
    </DocumentPage>
  );
}
