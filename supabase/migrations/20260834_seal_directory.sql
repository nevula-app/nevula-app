-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Close the authenticated directory leak.
-- Privileged wipe of leftover list-all rows, then own-row only (incl. DELETE).
-- Peer identity and keys travel only in the pairing QR / decrypted intro.
-- There is no list-all, no lookup by NEVULA ID, and no uuid→identity/key oracle.

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
