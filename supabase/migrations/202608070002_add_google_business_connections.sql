-- Phase 5.5: Google Business Profile OAuth connection table.
create table if not exists public.vakilcard_google_business_connections (
  profile_id uuid primary key references public.vakilcard_profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  business_account_id text,
  business_location_id text,
  business_name text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-use touch updated_at trigger
drop trigger if exists vakilcard_google_business_connections_touch on public.vakilcard_google_business_connections;
create trigger vakilcard_google_business_connections_touch before update on public.vakilcard_google_business_connections
  for each row execute function public.vakilcard_touch_updated_at();

alter table public.vakilcard_google_business_connections enable row level security;
