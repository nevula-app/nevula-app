// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * expo-secure-store rejects keys with characters outside [A-Za-z0-9._-].
 * Conversation ids like `nvl3:uuid:uuid` include `:`, which must be sanitized.
 */
export function toSecureStoreKey(...parts: string[]): string {
  const joined = parts.filter(part => part.length > 0).join('.');
  const sanitized = joined.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
  if (!sanitized) {
    throw new Error('SecureStore key must not be empty.');
  }
  return sanitized;
}
