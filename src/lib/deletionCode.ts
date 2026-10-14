// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateDeletionCode(randomBytes?: Uint8Array) {
  const bytes = randomBytes ?? globalThis.crypto.getRandomValues(new Uint8Array(20));
  if (bytes.length < 20) throw new Error('Deletion codes require at least 20 random bytes.');
  const chars = Array.from(bytes.slice(0, 20), byte => CODE_ALPHABET[byte & 31]).join('');
  return chars.match(/.{1,5}/g)?.join('-') ?? chars;
}
