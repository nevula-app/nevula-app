// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { Linking } from 'react-native';
import { nevulaGatedFetch, supabase } from './supabase';

export async function openNevulaCommunity(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('NEVULA membership is not available on this device.');

  const apiKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey) throw new Error('Community access is not configured.');
  const response = await nevulaGatedFetch('https://nevula.de/api/community/login-code', {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}`, 'x-nevula-api-key': apiKey },
  });
  const result = await response.json() as { code?: unknown };
  if (!response.ok || typeof result.code !== 'string' || !/^[a-f0-9]{64}$/.test(result.code)) {
    throw new Error('Could not create a secure community link. Please try again.');
  }
  const url = `https://nevula.de/community/connect?code=${result.code}`;

  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('Could not open the NEVULA Community.');
  await Linking.openURL(url);
}
