-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- A sender may physically delete only their own encrypted messages.
DROP POLICY IF EXISTS encrypted_messages_delete_own ON public.encrypted_messages;
CREATE POLICY encrypted_messages_delete_own
  ON public.encrypted_messages
  FOR DELETE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND private.is_conversation_member(conversation_id)
  );
