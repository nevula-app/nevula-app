-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

create table if not exists public.personal_delete_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  delete_key_hash text not null unique check (delete_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personal_delete_keys enable row level security;
revoke all on table public.personal_delete_keys from public, anon;
grant select, insert, update on table public.personal_delete_keys to authenticated;

drop policy if exists "Users manage their own personal delete key" on public.personal_delete_keys;
create policy "Users manage their own personal delete key"
on public.personal_delete_keys for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
