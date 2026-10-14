-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Paste in the live Supabase SQL editor AFTER apply_sealed_delivery.sql
-- (or after harden_privileges.sql on a DB that already has sealed delivery).
-- Expected: blobs_exist = true; blobs_rls = true; leftover graph counts = 0;
-- leftover_profiles = 0; leftover_device_keys = 0; all *_insert = false;
-- unique_device_ids = 0; profiles_delete / keys_delete = true;
-- profiles/keys select quals use auth.uid(); no USING (true);
-- wide_open_directory_policies = 0; peer oracles absent.
-- Apply wipes nevula_profiles / device_keys as the privileged editor role, then
-- own-row RLS + own-row DELETE. A fresh login REST list must be 0 rows (or only
-- own if something recreates), never 2 foreign NEVULA IDs / fingerprints / keys.
-- Graph purge must use WHERE (live 21000 / pg-safeupdate). Wipe + seal run before
-- best-effort purge, so a 21000 cannot skip them.
-- Graph and leftover directory counts are global only as the SQL editor role.
-- Do not treat GRANT SELECT as list-all.
-- After harden_privileges.sql: all *_truncate = false; purge/leftover/expiry
-- EXECUTE for authenticated = false; trigger EXECUTE for PUBLIC/anon/authenticated
-- = false; delete_blob_exec = true.

SELECT
  to_regclass('public.message_blobs') IS NOT NULL AS blobs_exist,
  COALESCE(
    (SELECT c.relrowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'message_blobs'),
    false
  ) AS blobs_rls,
  (SELECT count(*) FROM public.conversations) AS conversations,
  (SELECT count(*) FROM public.conversation_members) AS conversation_members,
  (SELECT count(*) FROM public.encrypted_messages) AS encrypted_messages,
  (SELECT count(*) FROM public.contact_requests
    WHERE status IN ('accepted', 'declined')
       OR created_at < now() - interval '48 hours') AS stale_pairing,
  (SELECT count(*) FROM public.message_retention_defaults) AS retention_defaults,
  (SELECT count(*) FROM public.nevula_profiles) AS leftover_profiles,
  (SELECT count(*) FROM public.device_keys) AS leftover_device_keys,
  (SELECT count(*) FROM public.device_keys WHERE device_id IS DISTINCT FROM 'primary') AS unique_device_ids;

SELECT
  has_table_privilege('authenticated', 'public.conversations', 'INSERT') AS conversations_insert,
  has_table_privilege('authenticated', 'public.conversation_members', 'INSERT') AS members_insert,
  has_table_privilege('authenticated', 'public.encrypted_messages', 'INSERT') AS messages_insert,
  has_table_privilege('authenticated', 'public.contact_requests', 'INSERT') AS pairing_insert,
  has_table_privilege('authenticated', 'public.message_retention_defaults', 'INSERT') AS retention_insert,
  has_table_privilege('authenticated', 'public.nevula_profiles', 'DELETE') AS profiles_delete,
  has_table_privilege('authenticated', 'public.device_keys', 'DELETE') AS keys_delete,
  has_table_privilege('authenticated', 'public.message_blobs', 'TRUNCATE') AS blobs_truncate,
  has_table_privilege('anon', 'public.message_blobs', 'TRUNCATE') AS blobs_anon_truncate,
  has_table_privilege('authenticated', 'public.contact_requests', 'TRUNCATE') AS pairing_truncate,
  has_table_privilege('anon', 'public.contact_requests', 'TRUNCATE') AS pairing_anon_truncate,
  has_table_privilege('authenticated', 'public.message_retention_defaults', 'TRUNCATE') AS retention_truncate,
  has_table_privilege('anon', 'public.message_retention_defaults', 'TRUNCATE') AS retention_anon_truncate,
  has_table_privilege('authenticated', 'public.conversation_retention_preferences', 'TRUNCATE') AS conv_retention_truncate,
  has_table_privilege('anon', 'public.conversation_retention_preferences', 'TRUNCATE') AS conv_retention_anon_truncate,
  CASE WHEN to_regprocedure('public.delete_message_blob(uuid)') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.delete_message_blob(uuid)', 'EXECUTE') END AS delete_blob_exec,
  CASE WHEN to_regprocedure('public.purge_legacy_delivery_graph()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.purge_legacy_delivery_graph()', 'EXECUTE') END AS purge_graph_exec,
  CASE WHEN to_regprocedure('public.purge_stale_contact_requests()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.purge_stale_contact_requests()', 'EXECUTE') END AS purge_stale_exec,
  CASE WHEN to_regprocedure('public.nvl_leftover_counts()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.nvl_leftover_counts()', 'EXECUTE') END AS leftover_counts_exec,
  CASE WHEN to_regprocedure('public.delete_expired_messages()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.delete_expired_messages()', 'EXECUTE') END AS delete_expired_exec,
  CASE WHEN to_regprocedure('public.enforce_message_expiry()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.enforce_message_expiry()', 'EXECUTE') END AS expiry_trigger_exec,
  CASE WHEN to_regprocedure('public.purge_expired_messages_on_write()') IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', 'public.purge_expired_messages_on_write()', 'EXECUTE') END AS purge_expired_exec,
  CASE WHEN to_regprocedure('public.enforce_message_expiry()') IS NULL THEN NULL
       ELSE NOT (
         has_function_privilege('anon', 'public.enforce_message_expiry()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.enforce_message_expiry()', 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname = 'public'
             AND p.proname = 'enforce_message_expiry'
             AND a.grantee = 0
             AND a.privilege_type = 'EXECUTE'
         )
       ) END AS expiry_trigger_no_client_exec,
  CASE WHEN to_regprocedure('public.purge_expired_messages_on_write()') IS NULL THEN NULL
       ELSE NOT (
         has_function_privilege('anon', 'public.purge_expired_messages_on_write()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.purge_expired_messages_on_write()', 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname = 'public'
             AND p.proname = 'purge_expired_messages_on_write'
             AND a.grantee = 0
             AND a.privilege_type = 'EXECUTE'
         )
       ) END AS purge_expired_no_client_exec,
  CASE WHEN to_regprocedure('public.enforce_blob_expiry()') IS NULL THEN NULL
       ELSE NOT (
         has_function_privilege('anon', 'public.enforce_blob_expiry()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.enforce_blob_expiry()', 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname = 'public'
             AND p.proname = 'enforce_blob_expiry'
             AND a.grantee = 0
             AND a.privilege_type = 'EXECUTE'
         )
       ) END AS blob_expiry_no_client_exec,
  CASE WHEN to_regprocedure('public.purge_expired_blobs_on_write()') IS NULL THEN NULL
       ELSE NOT (
         has_function_privilege('anon', 'public.purge_expired_blobs_on_write()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.purge_expired_blobs_on_write()', 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname = 'public'
             AND p.proname = 'purge_expired_blobs_on_write'
             AND a.grantee = 0
             AND a.privilege_type = 'EXECUTE'
         )
       ) END AS purge_blobs_no_client_exec,
  CASE WHEN to_regprocedure('public.purge_stale_contact_requests_on_write()') IS NULL THEN NULL
       ELSE NOT (
         has_function_privilege('anon', 'public.purge_stale_contact_requests_on_write()', 'EXECUTE')
         OR has_function_privilege('authenticated', 'public.purge_stale_contact_requests_on_write()', 'EXECUTE')
         OR EXISTS (
           SELECT 1
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
           WHERE n.nspname = 'public'
             AND p.proname = 'purge_stale_contact_requests_on_write'
             AND a.grantee = 0
             AND a.privilege_type = 'EXECUTE'
         )
       ) END AS purge_stale_on_write_no_client_exec;

SELECT
  (
    SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nevula_profiles' AND policyname = 'nevula_profiles_select'
  ) AS profiles_select_qual,
  (
    SELECT qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'device_keys' AND policyname = 'device_keys_select'
  ) AS keys_select_qual,
  (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('nevula_profiles', 'device_keys')
      AND cmd = 'SELECT'
      AND qual IN ('true', '(true)')
  ) AS wide_open_directory_policies,
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_peer_profile'
  ) AS no_peer_profile_oracle,
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_peer_device_key'
  ) AS no_peer_key_oracle;
