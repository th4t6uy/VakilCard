-- VakilCard Phase 3: frontend-backend integration deltas (applied to
-- hxvnsywaplmzpyxyuuxl 2026-07-18). Additive only.

-- Onboarding funnel events happen before a profile exists.
alter table public.vakilcard_analytics_events alter column profile_id drop not null;

-- Extend the event whitelist with funnel + presence events.
alter table public.vakilcard_analytics_events drop constraint if exists vakilcard_analytics_events_event_type_check;
alter table public.vakilcard_analytics_events add constraint vakilcard_analytics_events_event_type_check
  check (event_type in (
    'view','share','call','whatsapp','email','pay','directions','save_contact',
    'appointment','website','qr_download',
    'cta_click','otp_started','otp_verified','draft_created',
    'profile_25','profile_50','profile_75','published','social_click'
  ));

-- Professional Presence: configured-only social/professional links.
-- Shape: {"linkedin": "https://...", "x": "...", "instagram": "...",
--         "youtube": "...", "barcouncil": "..."} — only set keys render.
alter table public.vakilcard_profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;
