-- VakilCard MVP schema (applied to hxvnsywaplmzpyxyuuxl on 2026-07-18).
-- Server-side (service role) access only: RLS enabled, no anon/authenticated policies.
create extension if not exists citext;

create or replace function public.vakilcard_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.vakilcard_profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  username citext not null unique check (username ~ '^[a-z0-9][a-z0-9_.]{2,29}$'),
  full_name text not null,
  designation text,
  enrollment_number text,
  years_of_practice int check (years_of_practice between 0 and 80),
  languages text[] not null default '{}',
  bio text check (char_length(bio) <= 500),
  photo_url text,
  email text,
  phone text,
  whatsapp text,
  website text,
  show_email boolean not null default true,
  show_phone boolean not null default true,
  is_published boolean not null default false,
  theme_preference text not null default 'system' check (theme_preference in ('system','light','dark')),
  caselinx_profile_id uuid,
  caselinx_firm_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vakilcard_profiles_touch before update on public.vakilcard_profiles
  for each row execute function public.vakilcard_touch_updated_at();

create table if not exists public.vakilcard_practice_areas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  area text not null,
  position int not null default 0,
  unique (profile_id, area)
);

create table if not exists public.vakilcard_offices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  chamber_name text,
  address text,
  maps_url text,
  timings text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vakilcard_payment_prefs (
  profile_id uuid primary key references public.vakilcard_profiles(id) on delete cascade,
  upi_id text,
  upi_qr_url text,
  consultation_fee numeric(10,2) check (consultation_fee >= 0),
  show_upi boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger vakilcard_payment_prefs_touch before update on public.vakilcard_payment_prefs
  for each row execute function public.vakilcard_touch_updated_at();

create table if not exists public.vakilcard_appointment_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  purpose text,
  requested_date date not null,
  requested_slot text,
  status text not null default 'pending' check (status in ('pending','confirmed','declined','completed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_vakilcard_appt_profile on public.vakilcard_appointment_requests (profile_id, created_at desc);

create table if not exists public.vakilcard_analytics_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  event_type text not null check (event_type in ('view','share','call','whatsapp','email','pay','directions','save_contact','appointment','website','qr_download')),
  referrer text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vakilcard_events_profile on public.vakilcard_analytics_events (profile_id, event_type, created_at desc);

alter table public.vakilcard_profiles enable row level security;
alter table public.vakilcard_practice_areas enable row level security;
alter table public.vakilcard_offices enable row level security;
alter table public.vakilcard_payment_prefs enable row level security;
alter table public.vakilcard_appointment_requests enable row level security;
alter table public.vakilcard_analytics_events enable row level security;

insert into public.reserved_usernames (username) values
  ('vakilcard'),('courtlinx'),('courtque'),('evidencehash'),('lexdraft'),('barelex'),
  ('www'),('mail'),('blog'),('docs'),('legal'),('privacy'),('terms'),('about'),
  ('contact'),('login'),('signup'),('settings'),('dashboard'),('me'),('card'),('tester')
on conflict (username) do nothing;
