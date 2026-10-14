// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export const INACTIVITY_EXPIRY_DAYS = 28;
export const INACTIVITY_EXPIRY_MS = INACTIVITY_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function isPrivateContentExpired(lastPrivateAccessAt: number, now = Date.now()) {
  if (!Number.isFinite(lastPrivateAccessAt) || lastPrivateAccessAt <= 0) return false;
  return now - lastPrivateAccessAt >= INACTIVITY_EXPIRY_MS;
}
