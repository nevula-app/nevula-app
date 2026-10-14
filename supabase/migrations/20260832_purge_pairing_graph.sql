-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Leftover pairing rows and the old chat graph are durable A–B knowledge.
-- After this patch: no new graph edges; pending pairing expires; history is burned.

DO $$
BEGIN
  DROP POLICY IF EXISTS contact_requests_insert ON public.contact_requests;
  DROP POLICY IF EXISTS conversation_members_insert ON public.conversation_members;
  DROP POLICY IF EXISTS conversations_insert ON public.conversations;
  DROP POLICY IF EXISTS encrypted_messages_insert ON public.encrypted_messages;
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

CREATE OR REPLACE FUNCTION public.purge_stale_contact_requests()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.contact_requests
  WHERE status IN ('accepted', 'declined')
     OR created_at < now() - interval '48 hours';
$$;
REVOKE ALL ON FUNCTION public.purge_stale_contact_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_stale_contact_requests() TO authenticated;

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
REVOKE ALL ON FUNCTION public.purge_legacy_delivery_graph() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_legacy_delivery_graph() TO authenticated;

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

-- Best-effort: pg-safeupdate 21000 must not abort later directory-seal migrations.
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
