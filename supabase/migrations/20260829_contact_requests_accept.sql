-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Receiver (or sender) may update a contact request so one-sided Accept completes the pair.
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contact_requests', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY contact_requests_select
  ON public.contact_requests
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY contact_requests_insert
  ON public.contact_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid() AND sender_id <> receiver_id);

CREATE POLICY contact_requests_update
  ON public.contact_requests
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());
