-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Final least-privilege pass for the live schema.
-- No rows are modified and no application object is dropped.

-- Supabase projects historically granted future public-schema objects to the
-- API roles automatically. Make future exposure opt-in for both roles that may
-- own objects in a managed project. Existing explicit grants are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Preserve the exact authorization semantics while avoiding per-row auth.uid()
-- evaluation. Anonymous NEVULA accounts intentionally use the authenticated
-- database role; every policy remains scoped to the JWT's user id.
DROP POLICY IF EXISTS conversation_members_delete_own ON public.conversation_members;
CREATE POLICY conversation_members_delete_own ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR private.is_conversation_member(id)
  );

DROP POLICY IF EXISTS encrypted_messages_delete_own ON public.encrypted_messages;
CREATE POLICY encrypted_messages_delete_own ON public.encrypted_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND private.is_conversation_member(conversation_id)
  );

CREATE INDEX IF NOT EXISTS conversation_retention_preferences_conversation_idx
  ON public.conversation_retention_preferences (conversation_id);

-- delete_message_blob(uuid) intentionally remains an authenticated
-- SECURITY DEFINER capability RPC: sealed-delivery rows do not retain sender
-- identity, and the unguessable message UUID is held locally by the sender.
-- PUBLIC and anon have no EXECUTE grant; changing this requires a coordinated
-- app/schema design change, not a privilege-only migration.
