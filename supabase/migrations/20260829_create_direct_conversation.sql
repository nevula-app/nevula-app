-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- One-sided accept must be able to create the 1:1 chat.
-- Direct INSERT into conversations is blocked if the live INSERT policy still
-- requires membership (chicken-and-egg) or if 20260828 was never applied.
-- create_direct_conversation bypasses table RLS after verifying a request exists.

CREATE SCHEMA IF NOT EXISTS private;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        tablename IN (
          'conversation_members',
          'conversations',
          'encrypted_messages',
          'conversation_retention_preferences'
        )
        OR coalesce(qual, '') ILIKE '%is_conversation_member%'
        OR coalesce(with_check, '') ILIKE '%is_conversation_member%'
        OR coalesce(qual, '') ILIKE '%is_conversation_creator%'
        OR coalesce(with_check, '') ILIKE '%is_conversation_creator%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS private.is_conversation_member(uuid);
DROP FUNCTION IF EXISTS private.is_conversation_creator(uuid);
DROP FUNCTION IF EXISTS public.create_direct_conversation(uuid);

CREATE OR REPLACE FUNCTION private.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members AS members
    WHERE members.conversation_id = p_conversation_id
      AND members.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.is_conversation_creator(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations AS conversations
    WHERE conversations.id = p_conversation_id
      AND conversations.created_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION private.is_conversation_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_conversation_creator(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_conversation_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_conversation_creator(uuid) TO authenticated;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.encrypted_messages TO authenticated;

CREATE POLICY conversation_members_select
  ON public.conversation_members
  FOR SELECT
  TO authenticated
  USING (private.is_conversation_member(conversation_id));

CREATE POLICY conversation_members_insert
  ON public.conversation_members
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_conversation_creator(conversation_id));

CREATE POLICY conversation_members_delete_own
  ON public.conversation_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY conversations_select
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR private.is_conversation_member(id)
  );

CREATE POLICY conversations_insert
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY encrypted_messages_select
  ON public.encrypted_messages
  FOR SELECT
  TO authenticated
  USING (private.is_conversation_member(conversation_id));

CREATE POLICY encrypted_messages_insert
  ON public.encrypted_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND private.is_conversation_member(conversation_id)
  );

CREATE POLICY encrypted_messages_delete_own
  ON public.encrypted_messages
  FOR DELETE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND private.is_conversation_member(conversation_id)
  );

ALTER TABLE public.conversation_retention_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_retention_own ON public.conversation_retention_preferences;
CREATE POLICY conversation_retention_own
  ON public.conversation_retention_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND private.is_conversation_member(conversation_id)
  );

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_partner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conversation_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_partner_id IS NULL OR p_partner_id = v_me THEN
    RAISE EXCEPTION 'Invalid partner';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nevula_profiles WHERE user_id = p_partner_id) THEN
    RAISE EXCEPTION 'Unknown NEVULA user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contact_requests
    WHERE
      (sender_id = v_me AND receiver_id = p_partner_id)
      OR (sender_id = p_partner_id AND receiver_id = v_me)
  ) THEN
    RAISE EXCEPTION 'No contact request between these users';
  END IF;

  UPDATE public.contact_requests
  SET status = 'accepted', updated_at = now()
  WHERE sender_id = p_partner_id
    AND receiver_id = v_me
    AND status = 'pending';

  UPDATE public.contact_requests
  SET status = 'accepted', updated_at = now()
  WHERE sender_id = v_me
    AND receiver_id = p_partner_id
    AND status = 'pending';

  SELECT cm1.conversation_id
  INTO v_conversation_id
  FROM public.conversation_members cm1
  JOIN public.conversation_members cm2
    ON cm1.conversation_id = cm2.conversation_id
  WHERE cm1.user_id = v_me
    AND cm2.user_id = p_partner_id
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  INSERT INTO public.conversations (created_by)
  VALUES (v_me)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES
    (v_conversation_id, v_me),
    (v_conversation_id, p_partner_id);

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;
