// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
// OWASP scrypt profile: 16 MiB, r=8, p=5, within the Worker memory budget.
const OPTIONS = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= 15 && [...value].length <= 128;
}
export function validNickname(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/.test(value);
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return ['scrypt-v1', salt, scryptSync(password, salt, 32, OPTIONS).toString('hex')].join('$');
}
const DUMMY = ['scrypt-v1', '0'.repeat(32), '0'.repeat(64)].join('$');
export function verifyPassword(password: string, stored: string | null): boolean {
  const [version, salt, expected] = (stored ?? DUMMY).split('$');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
  const actual = scryptSync(password, salt, 32, OPTIONS);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && stored !== null;
}
