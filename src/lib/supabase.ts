// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { createNevTorGatedFetch } from './nevtor/gate';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and '
      + 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).',
  );
}

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/** Raw fetch used by Tor exit probe so the gate never deadlocks on itself. */
export const nevulaRawFetch = globalThis.fetch.bind(globalThis);
/** Shared NevTOR gate for app HTTP outside the Supabase client (e.g. Community). */
export const nevulaGatedFetch = createNevTorGatedFetch(nevulaRawFetch);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: nevulaGatedFetch,
  },
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
