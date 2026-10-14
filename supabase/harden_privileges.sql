-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Privilege hardening only. Safe on a DB that already has live objects.
-- Drift: live schema_migrations may only list Aug 28 files; sealed delivery
-- (message_blobs, purge RPCs, directory seal) was applied via SQL editor
-- (apply_sealed_delivery.sql). This file does not recreate that body and does
-- not DELETE user data. Idempotent REVOKE/GRANT, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE of delete_message_blob.
--
-- Paste the twin supabase/harden_privileges.sql in the SQL editor, or apply
-- this migration with supabase db push. Do not db reset production.
--
-- Follow-ups (Auth dashboard, not SQL): leaked password protection; anonymous
-- sign-in remains a product decision.
-- Optional: DROP FUNCTION IF EXISTS public.nvl_leftover_counts();

-- Table DML: drop TRUNCATE/REFERENCES/TRIGGER, then least-privilege grants
-- matching sealed-delivery RLS (no graph INSERT; no retention INSERT/UPDATE).

DO $$
BEGIN
  IF to_regclass('public.message_blobs') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.message_blobs FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, DELETE ON TABLE public.message_blobs TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.message_blobs TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.contact_requests') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.contact_requests FROM PUBLIC, anon, authenticated;
    GRANT SELECT, UPDATE, DELETE ON TABLE public.contact_requests TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.contact_requests TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.message_retention_defaults') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.message_retention_defaults FROM PUBLIC, anon, authenticated;
    GRANT SELECT, DELETE ON TABLE public.message_retention_defaults TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.message_retention_defaults TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.conversation_retention_preferences') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.conversation_retention_preferences FROM PUBLIC, anon, authenticated;
    GRANT SELECT, UPDATE, DELETE ON TABLE public.conversation_retention_preferences TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.conversation_retention_preferences TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.nevula_profiles') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.nevula_profiles FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nevula_profiles TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.nevula_profiles TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.device_keys') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.device_keys FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_keys TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.device_keys TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.conversations FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.conversations TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.conversations TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.conversation_members') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.conversation_members FROM PUBLIC, anon, authenticated;
    GRANT SELECT, DELETE ON TABLE public.conversation_members TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.conversation_members TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.encrypted_messages') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.encrypted_messages FROM PUBLIC, anon, authenticated;
    GRANT SELECT, DELETE ON TABLE public.encrypted_messages TO authenticated;
    BEGIN
      GRANT ALL ON TABLE public.encrypted_messages TO service_role;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END IF;
END $$;

-- Trigger functions: REVOKE EXECUTE (PG13+ triggers still fire as owner).
-- Admin RPCs: service_role only. Clients do not call purge_stale / purge_legacy
-- / nvl_leftover_counts.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'purge_legacy_delivery_graph',
        'purge_stale_contact_requests',
        'nvl_leftover_counts',
        'enforce_message_expiry',
        'purge_expired_messages_on_write',
        'enforce_blob_expiry',
        'purge_expired_blobs_on_write',
        'purge_stale_contact_requests_on_write',
        'delete_expired_messages'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
  END LOOP;

  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'purge_legacy_delivery_graph',
        'purge_stale_contact_requests',
        'nvl_leftover_counts',
        'delete_expired_messages'
      )
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;

-- delete_message_blob stays callable from the app (src/lib/messaging.ts
-- deleteEncryptedMessageForEveryone). No sender_id on blobs; require auth.uid().

DO $$
BEGIN
  IF to_regclass('public.message_blobs') IS NULL THEN
    RETURN;
  END IF;
  CREATE OR REPLACE FUNCTION public.delete_message_blob(p_id uuid)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $body$
    DELETE FROM public.message_blobs
    WHERE id = p_id
      AND (SELECT auth.uid()) IS NOT NULL;
  $body$;
  REVOKE ALL ON FUNCTION public.delete_message_blob(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.delete_message_blob(uuid) TO authenticated;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.delete_message_blob(uuid) TO service_role;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;

-- Unindexed FKs in baseline: conversations.created_by, encrypted_messages.sender_id.

DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations (created_by);
  END IF;
  IF to_regclass('public.encrypted_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS encrypted_messages_sender_idx ON public.encrypted_messages (sender_id);
  END IF;
END $$;

-- Initplan: wrap auth.uid() on leftover retention FOR ALL policies.

DO $$
BEGIN
  IF to_regclass('public.message_retention_defaults') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS retention_defaults_own ON public.message_retention_defaults;
  CREATE POLICY retention_defaults_own ON public.message_retention_defaults
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN undefined_table OR undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.conversation_retention_preferences') IS NULL
     OR to_regprocedure('private.is_conversation_member(uuid)') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS conversation_retention_own ON public.conversation_retention_preferences;
  CREATE POLICY conversation_retention_own ON public.conversation_retention_preferences
    FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (
      user_id = (SELECT auth.uid())
      AND private.is_conversation_member(conversation_id)
    );
EXCEPTION WHEN undefined_table OR undefined_object THEN NULL;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS conversation_retention_preferences_conversation_idx
  ON public.conversation_retention_preferences (conversation_id);

DROP POLICY IF EXISTS conversation_members_delete_own ON public.conversation_members;
CREATE POLICY conversation_members_delete_own ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR private.is_conversation_member(id)
  );

DROP POLICY IF EXISTS encrypted_messages_delete_own ON public.encrypted_messages;
CREATE POLICY encrypted_messages_delete_own ON public.encrypted_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND private.is_conversation_member(conversation_id)
  );
