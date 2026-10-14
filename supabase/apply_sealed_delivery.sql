-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Sealed delivery: one opaque blob per recipient. No sender, no conversation, no created_at.
-- After apply: no new A-B edges; leftover pairing expires; history burned; directory wiped; own-row.
-- ONE PASTE in the live SQL editor (under 16 KB, LF). Do not split. Then run verify_sealed_delivery.sql.
-- Privileged wipe + own-row seal run before historical purge. A 21000 cannot skip those.

CREATE TABLE IF NOT EXISTS public.message_blobs (
  id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (id, recipient_id),
  CONSTRAINT message_blobs_ciphertext_not_blank CHECK (btrim(ciphertext) <> '')
);
CREATE INDEX IF NOT EXISTS message_blobs_recipient_idx ON public.message_blobs (recipient_id);
CREATE INDEX IF NOT EXISTS message_blobs_expiry_idx ON public.message_blobs (expires_at);

ALTER TABLE public.message_blobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_blobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_blobs TO authenticated;

DROP POLICY IF EXISTS message_blobs_select ON public.message_blobs;
CREATE POLICY message_blobs_select ON public.message_blobs
  FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS message_blobs_insert ON public.message_blobs;
CREATE POLICY message_blobs_insert ON public.message_blobs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS message_blobs_delete ON public.message_blobs;
CREATE POLICY message_blobs_delete ON public.message_blobs
  FOR DELETE TO authenticated
  USING (recipient_id = (SELECT auth.uid()));

DO $$
BEGIN
  GRANT DELETE ON public.contact_requests TO authenticated;
  DROP POLICY IF EXISTS contact_requests_delete ON public.contact_requests;
  CREATE POLICY contact_requests_delete ON public.contact_requests
    FOR DELETE TO authenticated
    USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));
EXCEPTION WHEN undefined_table OR duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_blob_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'Messages must have a future expiry time';
  END IF;
  NEW.expires_at := LEAST(NEW.expires_at, now() + interval '28 days');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_blob_expiry() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS message_blobs_mandatory_expiry ON public.message_blobs;
CREATE TRIGGER message_blobs_mandatory_expiry
  BEFORE INSERT OR UPDATE OF expires_at ON public.message_blobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_blob_expiry();

CREATE OR REPLACE FUNCTION public.purge_expired_blobs_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.message_blobs WHERE expires_at <= now();
  DELETE FROM public.contact_requests
  WHERE status IN ('accepted', 'declined')
     OR created_at < now() - interval '48 hours';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_blobs_on_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS message_blobs_purge_expired ON public.message_blobs;
CREATE TRIGGER message_blobs_purge_expired
  AFTER INSERT OR UPDATE ON public.message_blobs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.purge_expired_blobs_on_write();

CREATE OR REPLACE FUNCTION public.delete_message_blob(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.message_blobs WHERE id = p_id AND (SELECT auth.uid()) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.delete_message_blob(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_blob(uuid) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_blobs;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

-- Stop new durable A-B edges. Honor leftover pending rows may still be read/accepted/deleted.
-- They cannot create new graph edges on a sealed server.

DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.create_direct_conversation(uuid);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS conversation_members_insert ON public.conversation_members;
  DROP POLICY IF EXISTS conversations_insert ON public.conversations;
  DROP POLICY IF EXISTS encrypted_messages_insert ON public.encrypted_messages;
  DROP POLICY IF EXISTS contact_requests_insert ON public.contact_requests;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE INSERT ON public.contact_requests FROM PUBLIC, anon, authenticated;
  REVOKE INSERT ON public.conversation_members FROM PUBLIC, anon, authenticated;
  REVOKE INSERT ON public.conversations FROM PUBLIC, anon, authenticated;
  REVOKE INSERT ON public.encrypted_messages FROM PUBLIC, anon, authenticated;
  REVOKE INSERT ON public.conversation_retention_preferences FROM PUBLIC, anon, authenticated;
  REVOKE INSERT, UPDATE ON public.message_retention_defaults FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.encrypted_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Close the authenticated directory leak. Wipe leftover list-all rows (SQL editor is privileged).
-- Then own-row only; DELETE granted so a later client retract works. No peer-lookup RPCs.
-- MUST run before historical purge. A purge 21000 must not skip these policies.

ALTER TABLE public.nevula_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.nevula_profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.device_keys;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('nevula_profiles', 'device_keys')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

DELETE FROM public.nevula_profiles WHERE true;
DELETE FROM public.device_keys WHERE true;

GRANT DELETE ON public.nevula_profiles, public.device_keys TO authenticated;
DROP POLICY IF EXISTS nevula_profiles_select ON public.nevula_profiles;
DROP POLICY IF EXISTS nevula_profiles_insert ON public.nevula_profiles;
DROP POLICY IF EXISTS nevula_profiles_update ON public.nevula_profiles;
DROP POLICY IF EXISTS nevula_profiles_delete ON public.nevula_profiles;
DROP POLICY IF EXISTS device_keys_select ON public.device_keys;
DROP POLICY IF EXISTS device_keys_insert ON public.device_keys;
DROP POLICY IF EXISTS device_keys_update ON public.device_keys;
DROP POLICY IF EXISTS device_keys_delete ON public.device_keys;
CREATE POLICY nevula_profiles_select ON public.nevula_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY nevula_profiles_insert ON public.nevula_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY nevula_profiles_update ON public.nevula_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY nevula_profiles_delete ON public.nevula_profiles
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY device_keys_select ON public.device_keys
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY device_keys_insert ON public.device_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY device_keys_update ON public.device_keys
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY device_keys_delete ON public.device_keys
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP FUNCTION IF EXISTS public.get_peer_profile(uuid);
DROP FUNCTION IF EXISTS public.get_peer_device_key(uuid);

-- Historical purge. Definitions are safe. Execution is best-effort (pg-safeupdate 21000).

CREATE OR REPLACE FUNCTION public.purge_stale_contact_requests()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.contact_requests
  WHERE status IN ('accepted', 'declined')
     OR created_at < now() - interval '48 hours';
$$;
REVOKE ALL ON FUNCTION public.purge_stale_contact_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_stale_contact_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_stale_contact_requests_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.contact_requests
  WHERE status IN ('accepted', 'declined')
     OR created_at < now() - interval '48 hours';
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_stale_contact_requests_on_write() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  DROP TRIGGER IF EXISTS contact_requests_purge_stale ON public.contact_requests;
  CREATE TRIGGER contact_requests_purge_stale
    AFTER INSERT OR UPDATE ON public.contact_requests
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.purge_stale_contact_requests_on_write();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purge_legacy_delivery_graph()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF to_regclass('public.encrypted_messages') IS NOT NULL THEN
    DELETE FROM public.encrypted_messages WHERE true;
  END IF;
  IF to_regclass('public.conversation_members') IS NOT NULL THEN
    DELETE FROM public.conversation_members WHERE true;
  END IF;
  IF to_regclass('public.conversations') IS NOT NULL THEN
    DELETE FROM public.conversations WHERE true;
  END IF;
  IF to_regclass('public.conversation_retention_preferences') IS NOT NULL THEN
    DELETE FROM public.conversation_retention_preferences WHERE true;
  END IF;
  IF to_regclass('public.message_retention_defaults') IS NOT NULL THEN
    DELETE FROM public.message_retention_defaults WHERE true;
  END IF;
  IF to_regclass('public.contact_requests') IS NOT NULL THEN
    DELETE FROM public.contact_requests
    WHERE status IN ('accepted', 'declined')
       OR created_at < now() - interval '48 hours';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_legacy_delivery_graph() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_legacy_delivery_graph() TO service_role;

DO $$
BEGIN
  BEGIN
    PERFORM public.purge_stale_contact_requests();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM public.purge_legacy_delivery_graph();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- One published key slot per account. Drop unique analytics-style device ids.
DO $$
BEGIN
  IF to_regclass('public.device_keys') IS NOT NULL THEN
    DELETE FROM public.device_keys d
    WHERE d.ctid NOT IN (
      SELECT DISTINCT ON (user_id) ctid
      FROM public.device_keys
      ORDER BY user_id, created_at DESC NULLS LAST
    );
    UPDATE public.device_keys SET device_id = 'primary' WHERE device_id IS DISTINCT FROM 'primary';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
