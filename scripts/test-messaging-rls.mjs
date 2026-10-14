// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env');
}

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function signIn() {
  const supabase = client();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw error || new Error('anonymous auth failed');
  return { supabase, userId: data.user.id };
}

async function ensureProfile(supabase, userId, nevulaId) {
  const { data: existing, error: readError } = await supabase
    .from('nevula_profiles')
    .select('user_id,nevula_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data, error } = await supabase
    .from('nevula_profiles')
    .insert({ user_id: userId, nevula_id: nevulaId })
    .select('user_id,nevula_id')
    .single();
  if (error) throw error;
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const a = await signIn();
  const b = await signIn();
  const c = await signIn();
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  await ensureProfile(a.supabase, a.userId, `TST-AAA-${suffix}`);
  const profileB = await ensureProfile(b.supabase, b.userId, `TST-BBB-${suffix}`);

  const { error: memberReadError } = await a.supabase.from('conversation_members').select('conversation_id').limit(1);
  assert(!memberReadError, `conversation_members SELECT still broken: ${memberReadError?.message}`);

  const { error: requestError } = await a.supabase
    .from('contact_requests')
    .insert({ sender_id: a.userId, receiver_id: b.userId });
  assert(!requestError, `contact request failed: ${requestError?.message}`);

  const { data: conversation, error: conversationError } = await b.supabase
    .from('conversations')
    .insert({ created_by: b.userId })
    .select('id')
    .single();
  assert(!conversationError && conversation?.id, `conversation insert failed: ${conversationError?.message}`);

  const { error: memberError } = await b.supabase.from('conversation_members').insert([
    { conversation_id: conversation.id, user_id: b.userId },
    { conversation_id: conversation.id, user_id: a.userId },
  ]);
  assert(!memberError, `membership insert failed: ${memberError?.message}`);

  const { data: aMembers, error: aMembersError } = await a.supabase
    .from('conversation_members')
    .select('conversation_id,user_id');
  assert(!aMembersError, `A membership list failed: ${aMembersError?.message}`);
  assert(
    (aMembers ?? []).some(row => row.conversation_id === conversation.id && row.user_id === b.userId),
    'A cannot see peer membership',
  );

  const { data: cMembers, error: cMembersError } = await c.supabase
    .from('conversation_members')
    .select('conversation_id,user_id');
  assert(!cMembersError, `C membership list failed: ${cMembersError?.message}`);
  assert(!(cMembers ?? []).some(row => row.conversation_id === conversation.id), 'stranger saw foreign memberships');

  const { data: cJoin, error: cJoinError } = await c.supabase.from('conversation_members').insert({
    conversation_id: conversation.id,
    user_id: c.userId,
  }).select('conversation_id');
  assert(!cJoin?.length && cJoinError, 'stranger was able to join the conversation');

  const { error: messageError } = await a.supabase.from('encrypted_messages').insert({
    conversation_id: conversation.id,
    sender_id: a.userId,
    ciphertext: '-----BEGIN PGP MESSAGE-----\ntest\n-----END PGP MESSAGE-----',
    content_type: 'text/plain; charset=utf-8; protocol=openpgp',
  });
  assert(!messageError, `message insert failed: ${messageError?.message}`);

  const { data: bMessages, error: bMessagesError } = await b.supabase
    .from('encrypted_messages')
    .select('id')
    .eq('conversation_id', conversation.id);
  assert(!bMessagesError && (bMessages ?? []).length > 0, `B could not read ciphertext: ${bMessagesError?.message}`);

  const { data: cMessages, error: cMessagesError } = await c.supabase
    .from('encrypted_messages')
    .select('id')
    .eq('conversation_id', conversation.id);
  assert(!cMessagesError, `C message read failed: ${cMessagesError?.message}`);
  assert(!(cMessages ?? []).length, 'stranger read foreign ciphertext');

  console.log('OK messaging RLS flow', {
    conversationId: conversation.id,
    contactNevulaId: profileB.nevula_id,
  });
}

main().catch(error => {
  console.error('FAIL', error.message ?? error);
  process.exit(1);
});
