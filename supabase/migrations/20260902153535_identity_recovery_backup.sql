-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

create table if not exists public.identity_recovery_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_id text not null unique,
  encrypted_contacts text not null,
  updated_at timestamptz not null default now(),
  constraint identity_recovery_id_format check (recovery_id ~ '^NVR(-[A-F0-9]{4}){6}$'),
  constraint identity_recovery_payload_size check (octet_length(encrypted_contacts) between 32 and 262144)
);

alter table public.identity_recovery_backups enable row level security;

revoke all on table public.identity_recovery_backups from anon, authenticated;
grant select, insert, update on table public.identity_recovery_backups to authenticated;

create policy "recovery owner select"
on public.identity_recovery_backups for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "recovery owner insert"
on public.identity_recovery_backups for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "recovery owner update"
on public.identity_recovery_backups for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
