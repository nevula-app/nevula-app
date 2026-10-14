-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Stop new durable A-B edges. Existing conversation rows can burn with their messages.
-- New clients deliver only through message_blobs.

REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  DROP POLICY IF EXISTS conversation_members_insert ON public.conversation_members;
  DROP POLICY IF EXISTS conversations_insert ON public.conversations;
  DROP POLICY IF EXISTS encrypted_messages_insert ON public.encrypted_messages;
  DROP POLICY IF EXISTS contact_requests_insert ON public.contact_requests;
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

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.encrypted_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

