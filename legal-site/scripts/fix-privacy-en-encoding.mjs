// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import fs from 'fs';

const path = 'components/privacy/body-en.tsx';
let s = fs.readFileSync(path, 'utf8');

const map = [
  ['ÔÇö', '—'],
  ['ÔåÆ', '→'],
  ['ÔÇ£', '“'],
  ['ÔÇØ', '”'],
  ['ÔÇÖ', '’'],
  ['Ôëñ', '≤'],
  ['ÔÇô', '–'],
  ['â€”', '—'],
  ['â†’', '→'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€™', '’'],
  ['â‰¤', '≤'],
  ['â€“', '–'],
];

for (const [bad, good] of map) {
  s = s.split(bad).join(good);
}

fs.writeFileSync(path, s, { encoding: 'utf8' });

const leftover = (s.match(/Ô|â€|â†|â‰/g) || []).length;
console.log('leftover_mojibake', leftover);
console.log('sample', s.includes('Calculator gate — entry PIN'));
