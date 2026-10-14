-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Anonymous account deletion credentials. The raw deletion code never reaches
-- Postgres; the Edge Function stores only a peppered SHA-256 digest.
CREATE TABLE IF NOT EXISTS public.account_deletion_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nevula_id text NOT NULL CHECK (nevula_id ~ '^NVL-[0-9A-F]{3}-[0-9A-F]{3}-[0-9A-F]{4}$'),
  code_digest text NOT NULL UNIQUE CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_deletion_credentials_nevula_idx
  ON public.account_deletion_credentials (nevula_id);
ALTER TABLE public.account_deletion_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_credentials FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  GRANT ALL ON TABLE public.account_deletion_credentials TO service_role;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.account_deletion_attempts (
  client_digest text PRIMARY KEY CHECK (client_digest ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
ALTER TABLE public.account_deletion_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_attempts FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  GRANT ALL ON TABLE public.account_deletion_attempts TO service_role;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
