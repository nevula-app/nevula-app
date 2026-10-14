// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { de } from './de';
import { en } from './en';
import type { Locale, Messages } from './types';

export * from './types';
export { de, en };

export const dictionaries: Record<Locale, Messages> = { de, en };

export function getDictionary(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries.en;
}
