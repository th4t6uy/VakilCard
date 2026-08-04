-- VakilCard Free vs Pro — Phases 2/3/4/5 schema (additive only).
-- Applied by founder via Supabase MCP against hxvnsywaplmzpyxyuuxl.

-- Phase 5: review link, explicit branding override, card theme.
alter table public.vakilcard_profiles
  add column if not exists google_review_link text,
  add column if not exists hide_branding boolean, -- null = auto (hide iff Pro); explicit true/false overrides
  add column if not exists card_theme text not null default 'default'
    check (card_theme in ('default', 'midnight', 'ivory'));

-- Phase 3: owner-configured weekly availability windows (Free + Pro both
-- use this; Pro additionally cross-checks Google Calendar on top of it).
-- Shape: [{"day":1,"start":"10:00","end":"13:00","slot_minutes":30}, ...]
-- day: 0=Sunday .. 6=Saturday.
alter table public.vakilcard_profiles
  add column if not exists booking_windows jsonb not null default '[]'::jsonb;

-- Phase 2: extend the analytics event whitelist (additive — old events
-- keep working unchanged).
alter table public.vakilcard_analytics_events drop constraint if exists vakilcard_analytics_events_event_type_check;
alter table public.vakilcard_analytics_events add constraint vakilcard_analytics_events_event_type_check
  check (event_type in (
    'view','share','call','whatsapp','email','pay','directions','save_contact',
    'appointment','website','qr_download',
    'cta_click','otp_started','otp_verified','draft_created',
    'profile_25','profile_50','profile_75','published','social_click',
    'nfc_tap','google_review','payment_claimed'
  ));

-- Phase 3+4: appointment requests already exist (vakilcard_appointment_requests,
-- MVP schema) as the one-way Free booking log. Extend it — additive columns
-- only — to also carry the Pro flow (precise slot, payment before confirm).
alter table public.vakilcard_appointment_requests
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists booking_type text not null default 'consultation'
    check (booking_type in ('consultation', 'custom')),
  add column if not exists amount_inr numeric(10, 2) check (amount_inr is null or amount_inr >= 0),
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'claimed_paid', 'confirmed')),
  add column if not exists is_pro_booking boolean not null default false;
create index if not exists idx_vakilcard_appt_payment on public.vakilcard_appointment_requests (profile_id, payment_status) where payment_status <> 'not_required';

-- Phase 4: Google Calendar connection per Pro profile. Inert (no rows,
-- no traffic) until GOOGLE_OAUTH_CLIENT_ID/SECRET are set in the environment
-- — see api/vakilcard/calendar.js. Tokens are service-role-only, same
-- access pattern as every other VakilCard table (RLS on, zero policies).
create table if not exists public.vakilcard_calendar_connections (
  profile_id uuid primary key references public.vakilcard_profiles(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger vakilcard_calendar_connections_touch before update on public.vakilcard_calendar_connections
  for each row execute function public.vakilcard_touch_updated_at();
alter table public.vakilcard_calendar_connections enable row level security;
