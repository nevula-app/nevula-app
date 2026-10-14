// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * NevTOR Phase 2 — traffic scope (from network-architecture review).
 *
 * Gated HTTP (NevTOR manager + createNevTorGatedFetch / nevulaGatedFetch):
 * - Supabase REST / Auth / RPC / Edge Functions via createClient `global.fetch`
 * - Community login-code HTTP (`communityAccess` + NevulaHome)
 *
 * Not Tor-bound in Phase 2 (clearnet unless Orbot/system VPN covers the whole device):
 * - Supabase Realtime WebSocket (needs WS proxy or poll-only mode)
 * - Linking.openURL / Share (system browser / other apps — DNS outside app)
 * - Native Vosk model download (HttpURLConnection in VoiceRewrite.kt)
 * - OS DNS resolution
 * - Tor exit probe (check.torproject.org) — intentional raw fetch
 *
 * Note: local expo-notifications scheduling is not remote FCM. Remote wake uses
 * device_push_tokens + Edge Function notify-message-push (Calculator text only).
 *
 * Phase 3: SOCKS5/native Tor, Realtime over Tor or HTTP polling, native download
 * routing, optional Tor-aware handling of external URL opens.
 */
export const NEVTOR_PHASE2_SCOPE = {
  gated: ['supabase-http', 'community-login-http'] as const,
  ungated: [
    'supabase-realtime-ws',
    'linking-share-exits',
    'native-vosk-download',
    'os-dns',
    'tor-exit-probe',
  ] as const,
};
