-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Sealed delivery: one opaque blob per recipient. No sender, no conversation, no created_at.
-- After pairing, clients may delete contact_request rows so the server does not keep a contact graph.

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
REVOKE ALL ON public.message_blobs FROM anon;
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

GRANT DELETE ON public.contact_requests TO authenticated;
DROP POLICY IF EXISTS contact_requests_delete ON public.contact_requests;
CREATE POLICY contact_requests_delete ON public.contact_requests
  FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

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
  DELETE FROM public.message_blobs WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION public.delete_message_blob(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_blob(uuid) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_blobs;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
