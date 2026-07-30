-- VakilCard Phase 2: identity & onboarding (applied to hxvnsywaplmzpyxyuuxl 2026-07-18).
-- Phone (WhatsApp-verified) is the primary identity; OAuth (Google/Firebase)
-- is secondary. All tables RLS deny-all: service-role access only.

-- ---------- accounts & identities ----------
create table if not exists public.vakilpedia_accounts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vakilpedia_accounts_touch before update on public.vakilpedia_accounts
  for each row execute function public.vakilcard_touch_updated_at();

create table if not exists public.account_phone_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vakilpedia_accounts(id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  verified_at timestamptz,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_phone_identities_account on public.account_phone_identities (account_id);

create table if not exists public.account_oauth_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vakilpedia_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','apple','microsoft','firebase')),
  provider_uid text not null,
  email text,
  display_name text,
  linked_at timestamptz not null default now(),
  unique (provider, provider_uid)
);
create index if not exists idx_oauth_identities_account on public.account_oauth_identities (account_id);

-- ---------- verification pipeline (provider-agnostic) ----------
create table if not exists public.verification_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  code_hash text not null,            -- HMAC-SHA256(code, server secret); raw codes never stored
  expires_at timestamptz not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  resend_count int not null default 0,
  last_sent_at timestamptz,
  ip text,
  device_fingerprint text,
  user_agent text,
  provider text not null default 'whatsapp',
  status text not null default 'pending' check (status in ('pending','verified','expired','locked','consumed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_verif_sessions_phone on public.verification_sessions (phone_e164, created_at desc);
create index if not exists idx_verif_sessions_ip on public.verification_sessions (ip, created_at desc);

-- ---------- profile ownership moves to accounts ----------
alter table public.vakilcard_profiles alter column firebase_uid drop not null;
alter table public.vakilcard_profiles add column if not exists account_id uuid unique references public.vakilpedia_accounts(id) on delete cascade;
-- Username rules widen: hyphen allowed (dot kept for Phase-1 compat), pure-digit phone usernames allowed.
alter table public.vakilcard_profiles drop constraint if exists vakilcard_profiles_username_check;
alter table public.vakilcard_profiles add constraint vakilcard_profiles_username_check
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

-- ---------- aliases: every past URL redirects forever ----------
create table if not exists public.vakilcard_aliases (
  alias citext primary key check (alias ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  kind text not null check (kind in ('phone','custom','legacy')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_aliases_profile on public.vakilcard_aliases (profile_id);

create table if not exists public.vakilcard_username_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  old_username citext not null,
  new_username citext not null,
  changed_at timestamptz not null default now()
);

-- ---------- observability ----------
create table if not exists public.identity_audit_log (
  id bigint generated always as identity primary key,
  account_id uuid,
  event text not null,
  phone_e164 text,
  ip text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_identity_audit_account on public.identity_audit_log (account_id, created_at desc);
create index if not exists idx_identity_audit_event on public.identity_audit_log (event, created_at desc);

create table if not exists public.message_templates (
  name text primary key,
  language text not null default 'en',
  channel text not null default 'whatsapp',
  provider_ref text,                  -- provider-side template id/name (e.g. Meta BM template)
  description text,
  active boolean not null default true
);

create table if not exists public.message_log (
  id bigint generated always as identity primary key,
  account_id uuid,
  phone_e164 text,
  template_name text not null,
  language text not null default 'en',
  variables jsonb not null default '{}'::jsonb,
  provider text not null,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','skipped')),
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_message_log_phone on public.message_log (phone_e164, created_at desc);

insert into public.message_templates (name, language, channel, provider_ref, description) values
  ('phone_verification_code', 'en', 'whatsapp', 'vakilpedia_otp', 'Authentication code message (Meta auth template, approved)'),
  ('vakilcard_welcome', 'en', 'whatsapp', 'vakilcard_welcome', 'Post-verification welcome with permanent card link (requires Meta approval)')
on conflict (name) do nothing;

-- ---------- RLS: deny-all, service-role only ----------
alter table public.vakilpedia_accounts enable row level security;
alter table public.account_phone_identities enable row level security;
alter table public.account_oauth_identities enable row level security;
alter table public.verification_sessions enable row level security;
alter table public.vakilcard_aliases enable row level security;
alter table public.vakilcard_username_history enable row level security;
alter table public.identity_audit_log enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_log enable row level security;

-- ---------- reserve current marketing routes as root namespaces ----------
insert into public.reserved_usernames (username) values
  ('app'),('tools'),('static'),('assets'),('products'),('ipc-to-bns-converter'),
  ('evidence-hash-sha256'),('ipcbnsconverter'),('evidence-hash'),('ipc-420-bns'),
  ('ipc-302-bns'),('vakilnama'),('refunds'),('shipping')
on conflict (username) do nothing;

-- ---------- backfill: existing Phase-1 profiles get accounts + aliases ----------
do $$
declare r record; acc uuid;
begin
  for r in select id, firebase_uid, username, email from public.vakilcard_profiles where account_id is null loop
    insert into public.vakilpedia_accounts default values returning id into acc;
    update public.vakilcard_profiles set account_id = acc where id = r.id;
    if r.firebase_uid is not null then
      insert into public.account_oauth_identities (account_id, provider, provider_uid, email)
      values (acc, 'firebase', r.firebase_uid, r.email)
      on conflict (provider, provider_uid) do nothing;
    end if;
    insert into public.vakilcard_aliases (alias, profile_id, kind, is_primary)
    values (r.username, r.id, 'custom', true)
    on conflict (alias) do nothing;
    insert into public.identity_audit_log (account_id, event, meta)
    values (acc, 'account_backfilled_phase2', jsonb_build_object('profile_id', r.id));
  end loop;
end $$;
