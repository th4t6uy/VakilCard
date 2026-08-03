-- VakilCard physical NFC card registry.
-- Decouples the physical tag's content (a permanent, opaque code, written
-- and locked ONCE at manufacturing time) from which customer it currently
-- points to (this table — always mutable). The tag itself never needs to be
-- re-flashed again: reassigning a card to a different account, replacing a
-- lost card, or fixing a mis-shipped order is a row update here, not a
-- hardware operation.
--
-- Strictly ADDITIVE — new table only, nothing existing is touched.
-- Server-side (service role) access only: RLS enabled, no anon/authenticated
-- policies — matches every other vakilcard_* table (see api/vakilcard/README.md
-- and the identity-model note there: "every vakilcard_* / identity table is
-- RLS deny-all; nothing readable with the anon key").

create table if not exists public.vakilcard_physical_cards (
  code text primary key check (code ~ '^[a-z0-9]{6,16}$'),
  status text not null default 'unbound' check (status in ('unbound', 'bound', 'revoked')),
  account_id uuid references public.vakilpedia_accounts(id) on delete set null,
  batch_label text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Fast lookup for "does this account already own a card" (support/admin use).
create index if not exists idx_vakilcard_physical_cards_account
  on public.vakilcard_physical_cards (account_id)
  where account_id is not null;

alter table public.vakilcard_physical_cards enable row level security;
-- No policies created: RLS enabled + zero policies = deny-all for anon and
-- authenticated roles. Only the service-role key (used exclusively by the
-- api/vakilcard/* serverless functions) can read or write this table.

-- Reserve the /nfc path segment so no advocate can ever register it as a
-- personal username and collide with the /nfc/:code public resolver route.
insert into public.reserved_usernames (username) values ('nfc')
on conflict (username) do nothing;
