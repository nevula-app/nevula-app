-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Fix: infinite recursion in conversation_members RLS.
-- conversation_members / conversations / encrypted_messages policies
-- previously queried conversation_members under RLS, which re-entered the
-- same policy. Membership checks now go through SECURITY DEFINER helpers
-- that bypass RLS. Table RLS stays enabled.

CREATE SCHEMA IF NOT EXISTS private;

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

ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('conversation_members', 'conversations', 'encrypted_messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- conversation_members
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

-- conversations
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

-- encrypted_messages
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
