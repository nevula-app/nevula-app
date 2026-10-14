-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Partner retention must be visible to the expiry trigger (bypass RLS).
-- Global purge RPC is no longer callable by signed-in clients.

ALTER TABLE public.encrypted_messages
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.message_retention_defaults (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  duration_value integer NOT NULL DEFAULT 24 CHECK (duration_value > 0),
  duration_unit text NOT NULL DEFAULT 'hours' CHECK (duration_unit IN ('minutes', 'hours', 'days')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_retention_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  duration_value integer NOT NULL CHECK (duration_value > 0),
  duration_unit text NOT NULL CHECK (duration_unit IN ('minutes', 'hours', 'days')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE public.message_retention_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_retention_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_defaults_own ON public.message_retention_defaults;
CREATE POLICY retention_defaults_own ON public.message_retention_defaults FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS conversation_retention_own ON public.conversation_retention_preferences;
CREATE POLICY conversation_retention_own ON public.conversation_retention_preferences FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (
    user_id = auth.uid() AND private.is_conversation_member(conversation_id)
  );

CREATE OR REPLACE FUNCTION public.enforce_message_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shortest_member_retention interval;
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'Messages must have a future expiry time';
  END IF;
  SELECT min(
    CASE COALESCE(per_chat.duration_unit, defaults.duration_unit, 'hours')
      WHEN 'minutes' THEN pg_catalog.make_interval(mins => COALESCE(per_chat.duration_value, defaults.duration_value, 24))
      WHEN 'hours' THEN pg_catalog.make_interval(hours => COALESCE(per_chat.duration_value, defaults.duration_value, 24))
      ELSE pg_catalog.make_interval(days => COALESCE(per_chat.duration_value, defaults.duration_value, 24))
    END
  ) INTO shortest_member_retention
  FROM public.conversation_members members
  LEFT JOIN public.conversation_retention_preferences per_chat
    ON per_chat.user_id = members.user_id AND per_chat.conversation_id = NEW.conversation_id
  LEFT JOIN public.message_retention_defaults defaults ON defaults.user_id = members.user_id
  WHERE members.conversation_id = NEW.conversation_id;

  NEW.expires_at := LEAST(
    NEW.expires_at,
    now() + COALESCE(shortest_member_retention, interval '24 hours'),
    now() + interval '28 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypted_messages_mandatory_expiry ON public.encrypted_messages;
CREATE TRIGGER encrypted_messages_mandatory_expiry
  BEFORE INSERT OR UPDATE OF expires_at ON public.encrypted_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_expiry();

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
