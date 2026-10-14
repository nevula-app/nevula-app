// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const migrations = readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
const baselineName = '20260827_baseline_schema.sql';
const baseline = readFileSync(join(migrationsDir, baselineName), 'utf8');

describe('Supabase migration baseline', () => {
  it('runs before every retained patch migration', () => {
    expect(migrations[0]).toBe(baselineName);
  });

  it.each([
    'nevula_profiles',
    'device_keys',
    'contact_requests',
    'conversations',
    'conversation_members',
    'encrypted_messages',
    'message_retention_defaults',
    'conversation_retention_preferences',
  ])('creates %s', table => {
    expect(baseline).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i'));
    expect(baseline).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
  });

  it('contains no destructive table or schema drops', () => {
    expect(baseline).not.toMatch(/\bDROP\s+(?:TABLE|SCHEMA)\b/i);
  });

  it('pins every SECURITY DEFINER function to an empty search path', () => {
    const definitions = baseline.split(/CREATE OR REPLACE FUNCTION/i).slice(1);
    const definers = definitions.filter(definition => /SECURITY DEFINER/i.test(definition));
    expect(definers.length).toBeGreaterThan(0);
    for (const definition of definers) {
      expect(definition.slice(0, definition.indexOf('AS $$'))).toMatch(/SET search_path = ''/i);
    }
  });
});

function deleteStatements(sql: string): string[] {
  return [...sql.matchAll(/\bDELETE\s+FROM\b[\s\S]*?;/gi)].map(match => match[0]);
}

function assertDeletesUseWhere(sql: string) {
  const statements = deleteStatements(sql);
  expect(statements.length).toBeGreaterThan(0);
  for (const statement of statements) {
    expect(statement).toMatch(/\bWHERE\b/i);
    expect(statement).not.toMatch(/^DELETE\s+FROM\s+\S+\s*;/i);
  }
}

describe('sealed delivery alignment', () => {
  const apply = readFileSync(join(process.cwd(), 'supabase', 'apply_sealed_delivery.sql'), 'utf8');
  const seal = readFileSync(join(migrationsDir, '20260831_seal_legacy_graph.sql'), 'utf8');
  const purge = readFileSync(join(migrationsDir, '20260832_purge_pairing_graph.sql'), 'utf8');
  const minimize = readFileSync(join(migrationsDir, '20260833_minimize_server_knowledge.sql'), 'utf8');
  const directory = readFileSync(join(migrationsDir, '20260834_seal_directory.sql'), 'utf8');

  it.each([
    ['apply_sealed_delivery.sql', apply],
    ['20260831_seal_legacy_graph.sql', seal],
    ['20260832_purge_pairing_graph.sql', purge],
  ] as const)('%s blocks new graph inserts', (_name, sql) => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS contact_requests_insert/i);
    expect(sql).toMatch(/REVOKE INSERT ON public\.contact_requests/i);
    expect(sql).toMatch(/REVOKE INSERT ON public\.conversation_members/i);
    expect(sql).toMatch(/REVOKE INSERT ON public\.encrypted_messages/i);
  });

  it('apply script and purge migration burn leftover graph rows', () => {
    for (const sql of [apply, purge]) {
      expect(sql).toMatch(/purge_legacy_delivery_graph/i);
      expect(sql).toMatch(/DELETE FROM public\.encrypted_messages WHERE/i);
      expect(sql).toMatch(/DELETE FROM public\.conversation_members WHERE/i);
      expect(sql).toMatch(/DELETE FROM public\.message_retention_defaults WHERE/i);
      expect(sql).toMatch(/created_at < now\(\) - interval '48 hours'/i);
    }
  });

  it.each([
    ['apply_sealed_delivery.sql', apply],
    ['20260832_purge_pairing_graph.sql', purge],
    ['20260833_minimize_server_knowledge.sql', minimize],
    ['20260834_seal_directory.sql', directory],
  ] as const)('%s DELETEs use WHERE, never a bare DELETE FROM', (_name, sql) => {
    assertDeletesUseWhere(sql);
  });

  it('apply script and later patches revoke retention writes and collapse device ids', () => {
    for (const sql of [apply, seal, purge, minimize]) {
      expect(sql).toMatch(/REVOKE INSERT,\s*UPDATE ON public\.message_retention_defaults/i);
    }
    for (const sql of [apply, minimize]) {
      expect(sql).toMatch(/device_id = 'primary'/);
    }
  });

  it('seals the directory before best-effort historical purge', () => {
    const wipeProfilesAt = apply.indexOf('DELETE FROM public.nevula_profiles WHERE true');
    const wipeKeysAt = apply.indexOf('DELETE FROM public.device_keys WHERE true');
    const profilesSealAt = apply.indexOf('CREATE POLICY nevula_profiles_select');
    const keysSealAt = apply.indexOf('CREATE POLICY device_keys_select');
    const profilesDeleteAt = apply.indexOf('CREATE POLICY nevula_profiles_delete');
    const keysDeleteAt = apply.indexOf('CREATE POLICY device_keys_delete');
    const dropPeerAt = apply.indexOf('DROP FUNCTION IF EXISTS public.get_peer_profile(uuid)');
    const purgeAt = apply.search(/PERFORM public\.purge_legacy_delivery_graph|SELECT public\.purge_legacy_delivery_graph/);
    expect(wipeProfilesAt).toBeGreaterThan(-1);
    expect(wipeKeysAt).toBeGreaterThan(wipeProfilesAt);
    expect(profilesSealAt).toBeGreaterThan(wipeKeysAt);
    expect(keysSealAt).toBeGreaterThan(profilesSealAt);
    expect(profilesDeleteAt).toBeGreaterThan(profilesSealAt);
    expect(keysDeleteAt).toBeGreaterThan(keysSealAt);
    expect(dropPeerAt).toBeGreaterThan(Math.max(keysDeleteAt, profilesDeleteAt));
    expect(purgeAt).toBeGreaterThan(dropPeerAt);
    expect(apply).toMatch(/MUST run before historical purge/i);
    expect(apply).toMatch(/GRANT DELETE ON public\.nevula_profiles, public\.device_keys TO authenticated/);
    expect(purge).toMatch(/pg-safeupdate 21000 must not abort later directory-seal/i);
    expect(purge).toMatch(/EXCEPTION WHEN OTHERS THEN NULL;/);
  });

  it('seals the profile and key directory to own-row RLS with no peer oracles', () => {
    for (const sql of [apply, directory]) {
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_peer_device_key\(uuid\)/);
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_peer_profile\(uuid\)/);
      expect(sql).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.get_peer_device_key/i);
      expect(sql).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.get_peer_profile/i);
      expect(sql).toMatch(/CREATE POLICY nevula_profiles_select[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY nevula_profiles_insert[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY nevula_profiles_update[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY nevula_profiles_delete[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY device_keys_select[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY device_keys_insert[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY device_keys_update[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/CREATE POLICY device_keys_delete[\s\S]*user_id = \(SELECT auth\.uid\(\)\)/);
      expect(sql).toMatch(/DELETE FROM public\.nevula_profiles WHERE true/);
      expect(sql).toMatch(/DELETE FROM public\.device_keys WHERE true/);
      expect(sql).toMatch(/GRANT DELETE ON public\.nevula_profiles, public\.device_keys TO authenticated/);
      expect(sql).not.toMatch(/CREATE POLICY nevula_profiles_select[\s\S]{0,160}USING \(true\)/);
      expect(sql).not.toMatch(/CREATE POLICY device_keys_select[\s\S]{0,160}USING \(true\)/);
      expect(sql).toMatch(/tablename IN \('nevula_profiles', 'device_keys'\)/);
      expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime DROP TABLE public\.nevula_profiles/);
      expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime DROP TABLE public\.device_keys/);
    }
    for (const sql of [apply, seal, purge, minimize, directory]) {
      expect(sql).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.get_peer_/i);
    }
  });

  it('keeps apply_sealed_delivery.sql one paste under the SQL editor budget', () => {
    expect(Buffer.byteLength(apply, 'utf8')).toBeLessThan(16_384);
    expect(apply).toMatch(/ONE PASTE/);
    expect(apply.charCodeAt(0)).not.toBe(0xfeff);
    expect(apply).not.toMatch(/\r\n/);
    expect(apply).not.toMatch(/[^\x00-\x7F]/);
  });

  it('ships a paste-ready live verification query', () => {
    const verify = readFileSync(join(process.cwd(), 'supabase', 'verify_sealed_delivery.sql'), 'utf8');
    expect(verify).toMatch(/blobs_exist/);
    expect(verify).toMatch(/conversations_insert/);
    expect(verify).toMatch(/unique_device_ids/);
    expect(verify).toMatch(/leftover_profiles/);
    expect(verify).toMatch(/leftover_device_keys/);
    expect(verify).toMatch(/profiles_delete/);
    expect(verify).toMatch(/keys_delete/);
    expect(verify).toMatch(/never 2 foreign/);
    expect(verify).toMatch(/has_table_privilege\('authenticated', 'public\.contact_requests', 'INSERT'\)/);
    expect(verify).toMatch(/has_table_privilege\('authenticated', 'public\.nevula_profiles', 'DELETE'\)/);
    expect(verify).toMatch(/has_table_privilege\('authenticated', 'public\.device_keys', 'DELETE'\)/);
    expect(verify).toMatch(/profiles_select_qual/);
    expect(verify).toMatch(/wide_open_directory_policies/);
    expect(verify).toMatch(/no_peer_key_oracle/);
    expect(verify).toMatch(/no_peer_profile_oracle/);
    expect(verify).not.toMatch(/peer_key_rpc/);
    expect(verify).toMatch(/has_table_privilege\('authenticated', 'public\.message_blobs', 'TRUNCATE'\)/);
    expect(verify).toMatch(/has_function_privilege\('authenticated', 'public\.delete_message_blob\(uuid\)', 'EXECUTE'\)/);
    expect(verify).toMatch(/has_function_privilege\('authenticated', 'public\.purge_legacy_delivery_graph\(\)', 'EXECUTE'\)/);
  });
});

describe('privilege hardening', () => {
  const harden = readFileSync(join(migrationsDir, '20260835_harden_privileges.sql'), 'utf8');
  const paste = readFileSync(join(process.cwd(), 'supabase', 'harden_privileges.sql'), 'utf8');
  const leftover = readFileSync(join(process.cwd(), 'supabase', 'leftover_counts.sql'), 'utf8');
  const apply = readFileSync(join(process.cwd(), 'supabase', 'apply_sealed_delivery.sql'), 'utf8');

  it('ships an identical SQL-editor twin of the hardening migration', () => {
    expect(paste.replace(/\r\n/g, '\n')).toBe(harden.replace(/\r\n/g, '\n'));
  });

  it('revokes wipe and diagnostic RPCs from clients, keeps delete_message_blob', () => {
    expect(harden).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
    expect(harden).toMatch(/purge_legacy_delivery_graph/);
    expect(harden).toMatch(/purge_stale_contact_requests/);
    expect(harden).toMatch(/nvl_leftover_counts/);
    expect(harden).toMatch(/enforce_message_expiry/);
    expect(harden).toMatch(/purge_expired_messages_on_write/);
    expect(harden).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_message_blob\(uuid\) TO authenticated/);
    expect(harden).toMatch(/AND \(SELECT auth\.uid\(\)\) IS NOT NULL/);
    expect(harden).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_legacy_delivery_graph\(\) TO authenticated/);
    expect(harden).toMatch(/conversations_created_by_idx/);
    expect(harden).toMatch(/REVOKE ALL ON TABLE public\.message_blobs FROM PUBLIC, anon, authenticated/);
    expect(harden).toMatch(/GRANT SELECT, INSERT, DELETE ON TABLE public\.message_blobs TO authenticated/);
    expect(harden).toMatch(/GRANT SELECT, DELETE ON TABLE public\.message_retention_defaults TO authenticated/);
  });

  it('does not recreate sealed delivery or wipe directory tables', () => {
    expect(harden).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.message_blobs/i);
    expect(harden).not.toMatch(/DELETE FROM public\.nevula_profiles WHERE true/);
    expect(harden).not.toMatch(/DELETE FROM public\.device_keys WHERE true/);
  });

  it('leftover_counts and apply no longer grant wipe RPCs to authenticated', () => {
    expect(leftover).toMatch(/REVOKE ALL ON FUNCTION public\.nvl_leftover_counts\(\) FROM PUBLIC, anon, authenticated/);
    expect(leftover).toMatch(/GRANT EXECUTE ON FUNCTION public\.nvl_leftover_counts\(\) TO service_role/);
    expect(leftover).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.nvl_leftover_counts\(\) TO authenticated/);
    expect(leftover).toMatch(/DROP FUNCTION IF EXISTS public\.nvl_leftover_counts/);
    expect(apply).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_legacy_delivery_graph\(\) TO service_role/);
    expect(apply).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_stale_contact_requests\(\) TO service_role/);
    expect(apply).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_legacy_delivery_graph\(\) TO authenticated/);
    expect(apply).toMatch(/AND \(SELECT auth\.uid\(\)\) IS NOT NULL/);
  });
});
