-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Self-contained: create the purge function first, then grant and schedule.
-- Safe to run even if the retention migration was never applied.

ALTER TABLE public.encrypted_messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_expired_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.encrypted_messages
  WHERE expires_at IS NOT NULL AND expires_at <= now();
$$;

REVOKE ALL ON FUNCTION public.delete_expired_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_expired_messages() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_expired_messages() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_messages() TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.encrypted_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.purge_expired_messages_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.encrypted_messages
  WHERE expires_at IS NOT NULL AND expires_at <= now();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS encrypted_messages_purge_expired ON public.encrypted_messages;
CREATE TRIGGER encrypted_messages_purge_expired
  AFTER INSERT OR UPDATE ON public.encrypted_messages
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.purge_expired_messages_on_write();

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-nevula-messages') THEN
      PERFORM cron.schedule('delete-expired-nevula-messages', '7 * * * *', 'select public.delete_expired_messages()');
    END IF;
  END IF;
END $$;
