-- VakilCard first-party user registry (operational visibility).
-- Strictly ADDITIVE — no column is dropped or narrowed, every existing row is
-- preserved. Adds registry timestamps + registration source to the shared
-- account model (vakilpedia_accounts); the registry itself is assembled in
-- frontend/api/vakilcard/admin.js from existing tables (no new tables).
--
-- Phone de-duplication is already guaranteed by the pre-existing UNIQUE
-- constraint on account_phone_identities(phone_e164) — duplicate verified
-- registrations reuse the same account (auth.js ensureAccountForPhone).

alter table public.vakilpedia_accounts
  add column if not exists last_login_at   timestamptz,
  add column if not exists last_active_at  timestamptz,
  add column if not exists registration_source text not null default 'vakilcard';

-- Backfill existing accounts so the admin registry shows sensible values.
update public.vakilpedia_accounts
  set registration_source = 'vakilcard'
  where registration_source is null;

-- Seed activity timestamps for pre-existing accounts from what we already
-- know (they verified at least once at creation; their card may have been
-- edited since). Never overwrite a real value.
update public.vakilpedia_accounts a
  set last_login_at  = coalesce(a.last_login_at, a.created_at),
      last_active_at = coalesce(
        a.last_active_at,
        greatest(
          a.created_at,
          (select max(p.updated_at) from public.vakilcard_profiles p where p.account_id = a.id)
        )
      );

-- Helpful index for the registry's default sort (newest registrations).
create index if not exists idx_vakilpedia_accounts_created_at
  on public.vakilpedia_accounts (created_at desc);
