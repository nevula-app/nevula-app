-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Denny Almeida
--
-- This file is part of NEVULA.
-- NEVULA is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as published by
-- the Free Software Foundation, version 3.

-- Public invitations are capabilities, not a searchable profile directory.
-- No plaintext token or public device/identity fields are stored here.
--
-- Apply checklist (test/preview DB first — not verified against production in-repo):
-- 1) Review grants: authenticated only; never anon on resolve/submit/rotate/revoke.
-- 2) Confirm message_blobs insert targets link.owner_id only (server never decrypts envelope).
-- 3) Exercise rotate → resolve → submit → revoke with two authenticated test users.
-- 4) Confirm rate-limit exceptions (invite_rate_limit) and expiry/max_uses (invite_unavailable).
-- 5) Confirm website never calls resolve; only the unlocked app does.
begin;
create schema if not exists invite_private;
revoke all on schema invite_private from public, anon, authenticated;
grant usage on schema invite_private to authenticated;

create table invite_private.links (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  envelope text not null check (length(envelope) between 100 and 8192 and envelope ~ '^NVI1\.[a-f0-9]{24}\.[a-f0-9]+$'),
  expires_at timestamptz,
  max_uses integer check (max_uses between 1 and 10000),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);
create table invite_private.receipts (
  token_hash text not null references invite_private.links(token_hash) on delete cascade,
  requester_hash text not null,
  blob_id uuid not null,
  expires_at timestamptz not null,
  primary key (token_hash, requester_hash)
);
create table invite_private.budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  started_at timestamptz not null,
  attempts integer not null,
  primary key (user_id, operation)
);
alter table invite_private.links enable row level security;
alter table invite_private.receipts enable row level security;
alter table invite_private.budgets enable row level security;
revoke all on all tables in schema invite_private from public, anon, authenticated;

-- These narrowly scoped private definer functions are the only table access.
-- Public RPC wrappers remain SECURITY INVOKER. Every entry checks auth.uid().
create function invite_private.budget(p_user uuid, p_operation text, p_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into invite_private.budgets(user_id, operation, started_at, attempts)
    values (p_user, p_operation, now(), 1)
  on conflict (user_id, operation) do update set
    started_at = case when invite_private.budgets.started_at < now() - interval '1 hour' then now() else invite_private.budgets.started_at end,
    attempts = case when invite_private.budgets.started_at < now() - interval '1 hour' then 1 else invite_private.budgets.attempts + 1 end
  returning attempts into n;
  if n > p_limit then raise exception 'invite_rate_limit'; end if;
  delete from invite_private.budgets where started_at < now() - interval '1 day';
  delete from invite_private.receipts where expires_at <= now();
end $$;

create function invite_private.rotate(p_hash text, p_envelope text, p_expires_at timestamptz, p_max_uses integer)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'invite_auth_required'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_envelope is null
     or length(p_envelope) not between 100 and 8192
     or p_envelope !~ '^NVI1\.[a-f0-9]{24}\.[a-f0-9]+$'
     or (p_expires_at is not null and p_expires_at <= now())
     or (p_max_uses is not null and p_max_uses not between 1 and 10000)
     then raise exception 'invite_invalid'; end if;
  -- Serializes create/replace/revoke, even when the owner has no link yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(me::text, 817));
  perform invite_private.budget(me, 'rotate', 20);
  delete from invite_private.links where owner_id = me;
  insert into invite_private.links(owner_id, token_hash, envelope, expires_at, max_uses)
    values(me, p_hash, p_envelope, p_expires_at, p_max_uses);
end $$;

create function invite_private.revoke()
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'invite_auth_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(me::text, 817));
  delete from invite_private.links where owner_id = me;
end $$;

create function invite_private.resolve(p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); result text;
begin
  if me is null then raise exception 'invite_auth_required'; end if;
  perform invite_private.budget(me, 'resolve', 120);
  select envelope into result from invite_private.links
    where token_hash = p_hash and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses
        or exists (select 1 from invite_private.receipts r where r.token_hash = p_hash
          and r.requester_hash = encode(sha256(convert_to(p_hash || ':' || me::text, 'UTF8')), 'hex') and r.expires_at > now()));
  if result is null then raise exception 'invite_unavailable'; end if;
  return result;
end $$;

create function invite_private.submit(p_hash text, p_id uuid, p_ciphertext text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); link invite_private.links%rowtype;
  requester text; existing uuid;
begin
  if me is null then raise exception 'invite_auth_required'; end if;
  if p_id is null or p_ciphertext is null or length(p_ciphertext) not between 20 and 32768
    or p_ciphertext not like 'NVL2.%' then raise exception 'invite_invalid'; end if;
  -- Row lock makes revocation/rotation, expiry, counting and enqueue one operation.
  select * into link from invite_private.links where token_hash = p_hash for update;
  if not found or (link.expires_at is not null and link.expires_at <= now()) or link.owner_id = me
    then raise exception 'invite_unavailable'; end if;
  requester := encode(sha256(convert_to(p_hash || ':' || me::text, 'UTF8')), 'hex');
  select blob_id into existing from invite_private.receipts
    where token_hash = p_hash and requester_hash = requester and expires_at > now();
  if existing is not null then return existing; end if;
  if link.max_uses is not null and link.uses >= link.max_uses then raise exception 'invite_unavailable'; end if;
  perform invite_private.budget(me, 'submit', 20);
  perform invite_private.budget(link.owner_id, 'inbox', 100);
  insert into public.message_blobs(id, recipient_id, ciphertext, expires_at)
    values(p_id, link.owner_id, p_ciphertext, now() + interval '7 days');
  delete from invite_private.receipts where token_hash = p_hash and requester_hash = requester;
  insert into invite_private.receipts values(p_hash, requester, p_id, now() + interval '7 days');
  update invite_private.links set uses = uses + 1 where owner_id = link.owner_id;
  return p_id;
end $$;

revoke all on all functions in schema invite_private from public, anon, authenticated;
grant execute on function invite_private.rotate(text,text,timestamptz,integer),
  invite_private.revoke(), invite_private.resolve(text), invite_private.submit(text,uuid,text) to authenticated;

create function public.rotate_contact_invite(p_hash text, p_envelope text, p_expires_at timestamptz default null, p_max_uses integer default null)
returns void language sql security invoker set search_path = '' as $$ select invite_private.rotate(p_hash,p_envelope,p_expires_at,p_max_uses) $$;
create function public.revoke_contact_invite()
returns void language sql security invoker set search_path = '' as $$ select invite_private.revoke() $$;
create function public.resolve_contact_invite(p_hash text)
returns text language sql security invoker set search_path = '' as $$ select invite_private.resolve(p_hash) $$;
create function public.submit_contact_invite(p_hash text, p_id uuid, p_ciphertext text)
returns uuid language sql security invoker set search_path = '' as $$ select invite_private.submit(p_hash,p_id,p_ciphertext) $$;
revoke all on function public.rotate_contact_invite(text,text,timestamptz,integer),
  public.revoke_contact_invite(), public.resolve_contact_invite(text), public.submit_contact_invite(text,uuid,text) from public, anon, authenticated;
grant execute on function public.rotate_contact_invite(text,text,timestamptz,integer),
  public.revoke_contact_invite(), public.resolve_contact_invite(text), public.submit_contact_invite(text,uuid,text) to authenticated;
commit;
