-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Device push tokens for remote FCM alerts (Calculator disguise only — never ciphertext).
-- Paste in Supabase SQL editor as a privileged role, then deploy edge function notify-message-push.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  badge_only boolean NOT NULL DEFAULT false,
  disguised_text text NOT NULL DEFAULT 'Please return to your calculator.',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token),
  CONSTRAINT device_push_tokens_token_not_blank CHECK (btrim(token) <> ''),
  CONSTRAINT device_push_tokens_platform_ok CHECK (platform in ('android', 'ios')),
  CONSTRAINT device_push_tokens_text_len CHECK (char_length(disguised_text) <= 120)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_enabled_idx
  ON public.device_push_tokens (user_id)
  WHERE enabled = true;

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.device_push_tokens FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_push_tokens TO authenticated;
GRANT ALL ON TABLE public.device_push_tokens TO service_role;

DROP POLICY IF EXISTS device_push_tokens_select ON public.device_push_tokens;
CREATE POLICY device_push_tokens_select ON public.device_push_tokens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS device_push_tokens_insert ON public.device_push_tokens;
CREATE POLICY device_push_tokens_insert ON public.device_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS device_push_tokens_update ON public.device_push_tokens;
CREATE POLICY device_push_tokens_update ON public.device_push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS device_push_tokens_delete ON public.device_push_tokens;
CREATE POLICY device_push_tokens_delete ON public.device_push_tokens
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
