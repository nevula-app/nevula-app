-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Retention stays on the device. Published keys use one slot, not a unique device id.

DO $$
BEGIN
  REVOKE INSERT, UPDATE ON public.message_retention_defaults FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.message_retention_defaults') IS NOT NULL THEN
    DELETE FROM public.message_retention_defaults WHERE true;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.device_keys') IS NOT NULL THEN
    DELETE FROM public.device_keys d
    WHERE d.ctid NOT IN (
      SELECT DISTINCT ON (user_id) ctid
      FROM public.device_keys
      ORDER BY user_id, created_at DESC NULLS LAST
    );
    UPDATE public.device_keys SET device_id = 'primary' WHERE device_id IS DISTINCT FROM 'primary';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
