// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export const SEALED_DELIVERY_UNAVAILABLE =
  'Sealed delivery is not available on this server yet. New chats and pairing cannot fall back to a contact list. Try again after the server update.';

export const PEER_KEY_UNAVAILABLE =
  'This chat has no local encryption key for the other device. Scan their pairing QR in person, then send again.';

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /schema cache|does not exist/i.test(error?.message ?? '');
}

export function isMissingFunction(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '');
}
