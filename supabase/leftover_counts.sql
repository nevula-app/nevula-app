-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Temporary diagnostic RPC: global leftover counts (SECURITY DEFINER bypasses RLS).
-- Not used by the app. After hardening: service_role / SQL editor only.
-- Optional drop once you no longer need it:
--   DROP FUNCTION IF EXISTS public.nvl_leftover_counts();
CREATE OR REPLACE FUNCTION public.nvl_leftover_counts()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'nevula_profiles', (SELECT count(*) FROM public.nevula_profiles),
    'device_keys', (SELECT count(*) FROM public.device_keys),
    'conversation_members', (SELECT count(*) FROM public.conversation_members),
    'conversations', (SELECT count(*) FROM public.conversations),
    'encrypted_messages', (SELECT count(*) FROM public.encrypted_messages),
    'contact_requests', (SELECT count(*) FROM public.contact_requests)
  );
$$;
REVOKE ALL ON FUNCTION public.nvl_leftover_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nvl_leftover_counts() TO service_role;
