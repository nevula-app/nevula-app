// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import type { ReactNode } from 'react';
import { BrandWord } from '@/components/site-shell';
import { privacyDeSections, privacyDeToc } from '@/lib/i18n/privacy-de';

function renderRich(text: string): ReactNode {
  // Link known phrases first
  const linkRules: Array<{ needle: string; href: string }> = [
    { needle: 'Support-Formular', href: '/help' },
    { needle: 'Community Board', href: '/community' },
    { needle: '„Daten löschen“', href: '/delete' },
    { needle: 'Abschnitt 2', href: '#calculator-gate' },
  ];

  for (const rule of linkRules) {
    if (text.includes(rule.needle)) {
      const [before, after] = text.split(rule.needle);
      return (
        <>
          {renderRich(before)}
          <a href={rule.href}>{rule.needle}</a>
          {after ? renderRich(after) : null}
        </>
      );
    }
  }

  // Brand + code=
  const tokens = text.split(/(NEVULA|=)/g);
  return tokens.map((token, i) => {
    if (token === 'NEVULA') return <BrandWord key={i} />;
    if (token === '=') return <code key={i}>=</code>;
    return <span key={i}>{token}</span>;
  });
}

export function PrivacyBodyDe({
  tocLabel,
  tocAria,
}: {
  tocLabel: string;
  tocAria: string;
}) {
  return (
    <>
      <nav className="privacyToc" aria-label={tocAria}>
        <p className="privacyTocLabel">{tocLabel}</p>
        <ol>
          {privacyDeToc.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ol>
      </nav>
      {privacyDeSections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{renderRich(section.title)}</h2>
          {section.blocks.map((block, i) => {
            if (block.type === 'ul') {
              return (
                <ul key={i}>
                  {block.items.map((item) => (
                    <li key={item}>{renderRich(item)}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p
                key={i}
                style={block.text.includes('\n') ? { whiteSpace: 'pre-line' } : undefined}
              >
                {renderRich(block.text)}
              </p>
            );
          })}
        </section>
      ))}
    </>
  );
}
