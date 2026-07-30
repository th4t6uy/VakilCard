-- VakilCard Free vs Pro: additive entitlement + username-source columns.
-- Applied to hxvnsywaplmzpyxyuuxl on 2026-07-19 via Supabase MCP.
alter table vakilcard_profiles
  add column if not exists subscription_plan text not null default 'FREE',
  add column if not exists subscription_status text not null default 'ACTIVE',
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists founder_pricing boolean not null default false,
  add column if not exists username_source text not null default 'AUTO',
  add column if not exists created_username text;

do $$ begin
  alter table vakilcard_profiles
    add constraint vakilcard_profiles_subscription_plan_chk
    check (subscription_plan in ('FREE','PRO'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table vakilcard_profiles
    add constraint vakilcard_profiles_subscription_status_chk
    check (subscription_status in ('ACTIVE','EXPIRED','CANCELLED'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table vakilcard_profiles
    add constraint vakilcard_profiles_username_source_chk
    check (username_source in ('AUTO','PHONE','CUSTOM'));
exception when duplicate_object then null; end $$;

-- Backfill existing rows: all-digit usernames came from the phone flow;
-- anything else was hand-picked before gating existed (grandfathered as
-- CUSTOM — enforcement applies to future changes only, links never break).
update vakilcard_profiles
  set username_source = case when username ~ '^[0-9]+$' then 'PHONE' else 'CUSTOM' end
  where created_username is null;

create index if not exists idx_vakilcard_profiles_subscription
  on vakilcard_profiles (subscription_plan, subscription_status);

-- Subscription lifecycle audit + checkout intents (provider-agnostic:
-- Razorpay/other webhook later inserts ACTIVATED via the billing secret).
create table if not exists vakilcard_subscription_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  profile_id uuid,
  event_type text not null check (event_type in ('CHECKOUT_CREATED','ACTIVATED','RENEWED','CANCELLED','EXPIRED')),
  plan text not null default 'PRO',
  price_inr integer,
  founder_pricing boolean not null default false,
  provider text,
  provider_ref text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_vc_sub_events_account on vakilcard_subscription_events (account_id, created_at desc);
alter table vakilcard_subscription_events enable row level security;
-- deny-all RLS (service-role only), consistent with every vakilcard_* table
