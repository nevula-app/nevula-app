// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import fs from 'fs';

const src = fs.readFileSync('components/privacy/en-source.tsx', 'utf8');
const start = src.indexOf('<section>');
const end = src.lastIndexOf('</section>') + '</section>'.length;
let body = src.slice(start, end);

const replacements = [
  [/<section>\s*\n\s*<h2>\s*\n\s*1\. What/, '<section id="was-ist">\n        <h2>\n          1. What'],
  [/<section>\s*\n\s*<h2>3\. Discreet/, '<section id="erscheinung">\n        <h2>3. Discreet'],
  [/<section>\s*\n\s*<h2>4\. What stays/, '<section id="auf-dem-telefon">\n        <h2>4. What stays'],
  [/<section>\s*\n\s*<h2>6\. Voice/, '<section id="sprachnotizen">\n        <h2>6. Voice'],
  [/<section>\s*\n\s*<h2>7\. Gallery/, '<section id="galerie-notizen-kalender">\n        <h2>7. Gallery'],
  [/<section>\s*\n\s*<h2>8\. What may exist/, '<section id="online">\n        <h2>8. What may exist'],
  [/<section>\s*\n\s*<h2>9\. Optional Tor/, '<section id="tor">\n        <h2>9. Optional Tor'],
  [/<section>\s*\n\s*<h2>10\. Discreet notifications/, '<section id="benachrichtigungen">\n        <h2>10. Discreet notifications'],
  [/<section>\s*\n\s*<h2>\s*\n\s*11\. Recovery/, '<section id="wiederherstellung">\n        <h2>\n          11. Recovery'],
  [/<section>\s*\n\s*<h2>12\. Public/, '<section id="einladungen">\n        <h2>12. Public'],
  [/<section>\s*\n\s*<h2>13\. Community/, '<section id="community">\n        <h2>13. Community'],
  [/<section>\s*\n\s*<h2>14\. Deletion/, '<section id="loeschung">\n        <h2>14. Deletion'],
  [/<section>\s*\n\s*<h2>15\. Phone/, '<section id="berechtigungen">\n        <h2>15. Phone'],
  [/<section>\s*\n\s*<h2>16\. Providers/, '<section id="anbieter">\n        <h2>16. Providers'],
  [/<section>\s*\n\s*<h2>17\. Continuous/, '<section id="sicherheit">\n        <h2>17. Continuous'],
  [/<section>\s*\n\s*<h2>18\. Contact/, '<section id="kontakt">\n        <h2>18. Contact'],
  [/<section>\s*\n\s*<h2>19\. Who is/, '<section id="verantwortlich">\n        <h2>19. Who is'],
];

for (const [re, to] of replacements) body = body.replace(re, to);

const out = `import { BrandWord } from '@/components/site-shell';

const toc = [
  { id: 'was-ist', label: '1. What NEVULA is' },
  { id: 'calculator-gate', label: '2. Calculator gate' },
  { id: 'erscheinung', label: '3. Discreet appearance' },
  { id: 'auf-dem-telefon', label: '4. What stays on your phone' },
  { id: 'nvl3', label: '5. Locked chats — NVL3' },
  { id: 'sprachnotizen', label: '6. Voice notes' },
  { id: 'galerie-notizen-kalender', label: '7. Gallery, Notes and Calendar' },
  { id: 'online', label: '8. What may exist online' },
  { id: 'tor', label: '9. Optional Tor (NevTOR)' },
  { id: 'benachrichtigungen', label: '10. Discreet notifications' },
  { id: 'wiederherstellung', label: '11. Recovery' },
  { id: 'einladungen', label: '12. Public contact invites' },
  { id: 'community', label: '13. Community on this website' },
  { id: 'loeschung', label: '14. Deletion' },
  { id: 'berechtigungen', label: '15. Phone permissions' },
  { id: 'anbieter', label: '16. Providers and ads' },
  { id: 'sicherheit', label: '17. Continuous security' },
  { id: 'kontakt', label: '18. Contact' },
  { id: 'verantwortlich', label: '19. Who is responsible' },
] as const;

export function PrivacyBodyEn({
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
          {toc.map((item) => (
            <li key={item.id}>
              <a href={\`#\${item.id}\`}>{item.label}</a>
            </li>
          ))}
        </ol>
      </nav>
${body}
    </>
  );
}
`;

fs.writeFileSync('components/privacy/body-en.tsx', out);
console.log('ok', out.length);
