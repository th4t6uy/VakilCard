-- Canonical reserved_usernames table (backfilled 2026-07-29).
--
-- Root-cause fix: this table was referenced by INSERT
-- (202607180001_vakilcard_mvp_schema.sql), INSERT
-- (202607180002_vakilcard_identity_phase2.sql) and ALTER TABLE
-- (202607180004_vakilcard_phase25_hardening.sql) but no CREATE TABLE for it
-- ever existed in migration history. It was created ad hoc (dashboard/MCP)
-- against the original production project, so `supabase db push` against a
-- brand-new database failed with:
--   relation "public.reserved_usernames" does not exist
--
-- This migration restores the missing DDL, ordered before its first use.
-- Only `username` is defined here; 202607180004 adds `category`, `reason`,
-- `created_at` (superseded by the default below), `expires_at`,
-- `created_by` and `enabled` via `alter table ... add column if not
-- exists`, so this stays forward-compatible with that migration unchanged.
--
-- Same deny-all / service-role-only RLS convention as every other
-- vakilcard_*/vakilpedia_* table (api/vakilcard/_lib.js reads this table
-- exclusively via the service role key, which bypasses RLS).
create extension if not exists citext;

create table if not exists public.reserved_usernames (
  username citext primary key check (username ~ '^[a-z0-9._-]+$'),
  created_at timestamptz not null default now()
);

alter table public.reserved_usernames enable row level security;
