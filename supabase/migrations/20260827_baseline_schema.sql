-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- NEVULA schema baseline for a completely empty Supabase project.
-- This migration only creates missing objects; it does not drop live data.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.nevula_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nevula_id text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nevula_profiles_nevula_id_format CHECK (nevula_id ~ '^NVL-[0-9A-F]{3}-[0-9A-F]{3}-[0-9A-F]{4}$'),
  CONSTRAINT nevula_profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.device_keys (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  public_key_armored text NOT NULL,
  fingerprint text NOT NULL,
  algorithm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT device_keys_user_device_unique UNIQUE (user_id, device_id),
  CONSTRAINT device_keys_device_id_not_blank CHECK (btrim(device_id) <> ''),
  CONSTRAINT device_keys_public_key_not_blank CHECK (btrim(public_key_armored) <> ''),
  CONSTRAINT device_keys_fingerprint_not_blank CHECK (btrim(fingerprint) <> '')
);

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_requests_distinct_users CHECK (sender_id <> receiver_id),
  CONSTRAINT contact_requests_status CHECK (status IN ('pending', 'accepted', 'declined'))
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_pending_pair_unique
  ON public.contact_requests (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS contact_requests_sender_created_idx ON public.contact_requests (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_requests_receiver_created_idx ON public.contact_requests (receiver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON public.conversation_members (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS public.encrypted_messages (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  content_type text NOT NULL DEFAULT 'text/plain; charset=utf-8; protocol=openpgp',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT encrypted_messages_ciphertext_not_blank CHECK (btrim(ciphertext) <> '')
);
CREATE INDEX IF NOT EXISTS encrypted_messages_conversation_created_idx
  ON public.encrypted_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS encrypted_messages_expiry_idx ON public.encrypted_messages (expires_at);

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
CREATE INDEX IF NOT EXISTS conversation_retention_conversation_idx
  ON public.conversation_retention_preferences (conversation_id, user_id);

ALTER TABLE public.nevula_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_retention_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_retention_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.nevula_profiles, public.device_keys, public.contact_requests TO authenticated;
GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversation_members, public.encrypted_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_retention_defaults, public.conversation_retention_preferences TO authenticated;

CREATE OR REPLACE FUNCTION private.is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members AS members
    WHERE members.conversation_id = p_conversation_id AND members.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.is_conversation_creator(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations AS conversations
    WHERE conversations.id = p_conversation_id AND conversations.created_by = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.is_conversation_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_conversation_creator(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_conversation_member(uuid), private.is_conversation_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS nevula_profiles_select ON public.nevula_profiles;
DROP POLICY IF EXISTS nevula_profiles_insert ON public.nevula_profiles;
DROP POLICY IF EXISTS nevula_profiles_update ON public.nevula_profiles;
DROP POLICY IF EXISTS device_keys_select ON public.device_keys;
DROP POLICY IF EXISTS device_keys_insert ON public.device_keys;
DROP POLICY IF EXISTS device_keys_update ON public.device_keys;
DROP POLICY IF EXISTS contact_requests_select ON public.contact_requests;
DROP POLICY IF EXISTS contact_requests_insert ON public.contact_requests;
DROP POLICY IF EXISTS contact_requests_update ON public.contact_requests;
DROP POLICY IF EXISTS conversations_select ON public.conversations;
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
DROP POLICY IF EXISTS conversation_members_select ON public.conversation_members;
DROP POLICY IF EXISTS conversation_members_insert ON public.conversation_members;
DROP POLICY IF EXISTS conversation_members_delete_own ON public.conversation_members;
DROP POLICY IF EXISTS encrypted_messages_select ON public.encrypted_messages;
DROP POLICY IF EXISTS encrypted_messages_insert ON public.encrypted_messages;
DROP POLICY IF EXISTS encrypted_messages_delete_own ON public.encrypted_messages;
DROP POLICY IF EXISTS retention_defaults_own ON public.message_retention_defaults;
DROP POLICY IF EXISTS conversation_retention_own ON public.conversation_retention_preferences;
DROP TRIGGER IF EXISTS contact_requests_protect_participants ON public.contact_requests;
DROP TRIGGER IF EXISTS encrypted_messages_mandatory_expiry ON public.encrypted_messages;
DROP TRIGGER IF EXISTS encrypted_messages_purge_expired ON public.encrypted_messages;

CREATE POLICY nevula_profiles_select ON public.nevula_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY nevula_profiles_insert ON public.nevula_profiles FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY nevula_profiles_update ON public.nevula_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY device_keys_select ON public.device_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY device_keys_insert ON public.device_keys FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY device_keys_update ON public.device_keys FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY contact_requests_select ON public.contact_requests FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));
CREATE POLICY contact_requests_insert ON public.contact_requests FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND sender_id <> receiver_id);
CREATE POLICY contact_requests_update ON public.contact_requests FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
  WITH CHECK (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR private.is_conversation_member(id));
CREATE POLICY conversations_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY conversation_members_select ON public.conversation_members FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id));
CREATE POLICY conversation_members_insert ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (private.is_conversation_creator(conversation_id));
CREATE POLICY conversation_members_delete_own ON public.conversation_members FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY encrypted_messages_select ON public.encrypted_messages FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id));
CREATE POLICY encrypted_messages_insert ON public.encrypted_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_conversation_member(conversation_id));
CREATE POLICY encrypted_messages_delete_own ON public.encrypted_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()) AND private.is_conversation_member(conversation_id));
CREATE POLICY retention_defaults_own ON public.message_retention_defaults FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY conversation_retention_own ON public.conversation_retention_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_conversation_member(conversation_id));

CREATE OR REPLACE FUNCTION private.protect_contact_request_participants()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.receiver_id <> OLD.receiver_id THEN
    RAISE EXCEPTION 'Contact request participants cannot be changed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER contact_requests_protect_participants
  BEFORE UPDATE ON public.contact_requests FOR EACH ROW
  EXECUTE FUNCTION private.protect_contact_request_participants();

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_partner_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conversation_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_partner_id IS NULL OR p_partner_id = v_me THEN RAISE EXCEPTION 'Invalid partner'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nevula_profiles WHERE user_id = p_partner_id) THEN
    RAISE EXCEPTION 'Unknown NEVULA user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contact_requests
    WHERE (sender_id = v_me AND receiver_id = p_partner_id)
       OR (sender_id = p_partner_id AND receiver_id = v_me)
  ) THEN RAISE EXCEPTION 'No contact request between these users'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    LEAST(v_me::text, p_partner_id::text) || ':' || GREATEST(v_me::text, p_partner_id::text), 0));
  UPDATE public.contact_requests SET status = 'accepted', updated_at = now()
    WHERE ((sender_id = v_me AND receiver_id = p_partner_id) OR (sender_id = p_partner_id AND receiver_id = v_me))
      AND status = 'pending';
  SELECT mine.conversation_id INTO v_conversation_id
    FROM public.conversation_members mine
    JOIN public.conversation_members theirs USING (conversation_id)
    WHERE mine.user_id = v_me AND theirs.user_id = p_partner_id LIMIT 1;
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (created_by) VALUES (v_me) RETURNING id INTO v_conversation_id;
    INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (v_conversation_id, v_me), (v_conversation_id, p_partner_id);
  END IF;
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_message_expiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE shortest_member_retention interval;
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'Messages must have a future expiry time';
  END IF;
  SELECT min(CASE COALESCE(per_chat.duration_unit, defaults.duration_unit, 'hours')
    WHEN 'minutes' THEN pg_catalog.make_interval(mins => COALESCE(per_chat.duration_value, defaults.duration_value, 24))
    WHEN 'hours' THEN pg_catalog.make_interval(hours => COALESCE(per_chat.duration_value, defaults.duration_value, 24))
    ELSE pg_catalog.make_interval(days => COALESCE(per_chat.duration_value, defaults.duration_value, 24)) END)
  INTO shortest_member_retention
  FROM public.conversation_members members
  LEFT JOIN public.conversation_retention_preferences per_chat
    ON per_chat.user_id = members.user_id AND per_chat.conversation_id = NEW.conversation_id
  LEFT JOIN public.message_retention_defaults defaults ON defaults.user_id = members.user_id
  WHERE members.conversation_id = NEW.conversation_id;
  NEW.expires_at := LEAST(NEW.expires_at, now() + COALESCE(shortest_member_retention, interval '24 hours'), now() + interval '28 days');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_message_expiry() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER encrypted_messages_mandatory_expiry
  BEFORE INSERT OR UPDATE OF expires_at ON public.encrypted_messages FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_expiry();

CREATE OR REPLACE FUNCTION public.delete_expired_messages()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.encrypted_messages WHERE expires_at IS NOT NULL AND expires_at <= now();
$$;
REVOKE ALL ON FUNCTION public.delete_expired_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_messages() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_messages_on_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.encrypted_messages WHERE expires_at IS NOT NULL AND expires_at <= now();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_messages_on_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER encrypted_messages_purge_expired
  AFTER INSERT OR UPDATE ON public.encrypted_messages FOR EACH STATEMENT
  EXECUTE FUNCTION public.purge_expired_messages_on_write();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.encrypted_messages;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
