// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { supabase } from './supabase';

/** All invite networking uses this seam. A future Tor transport must implement
 * every operation and enforce its own no-direct-fallback policy. No Tor required today. */
export interface ContactInviteTransport {
  call<T>(operation: 'rotate_contact_invite' | 'revoke_contact_invite' | 'resolve_contact_invite' | 'submit_contact_invite', args?: Record<string, unknown>): Promise<T>;
}
export const contactInviteTransport: ContactInviteTransport = {
  async call<T>(operation: Parameters<ContactInviteTransport['call']>[0], args = {}) {
    const { data, error } = await supabase.rpc(operation, args);
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Public contact links are not available on this server yet.');
      if (error.message?.includes('invite_rate_limit')) throw new Error('Too many attempts. Please try again later.');
      if (error.message?.includes('invite_unavailable')) throw new Error('This invitation has expired, was revoked or has reached its usage limit.');
      throw new Error('Could not complete the contact invitation. Please try again.');
    }
    return data as T;
  },
};
