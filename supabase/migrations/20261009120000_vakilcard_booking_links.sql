-- VakilCard: personal booking links (founder, 9 Oct 2026).
-- A Pro lawyer, on their own card, makes a one-client booking link and sends it over WhatsApp or
-- email. The client opens it, picks a free time, and a Google Meet link is created in the lawyer's
-- calendar. `meeting_provider` is open-ended on purpose: Zoom is added later with one provider
-- object in api/vakilcard/_meeting.js (the check below already allows it) -- no other change.
-- Additive only: no column dropped, no existing constraint rewritten.

create table if not exists public.vakilcard_booking_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.vakilcard_profiles(id) on delete cascade,
  token text not null unique,
  client_name text,
  client_phone text,
  client_email text,
  purpose text,
  meeting_provider text not null default 'google_meet',
  status text not null default 'open',
  expires_at timestamptz not null default (now() + interval '7 days'),
  appointment_id uuid,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.vakilcard_booking_links
    add constraint vakilcard_booking_links_provider_chk check (meeting_provider in ('google_meet', 'zoom'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.vakilcard_booking_links
    add constraint vakilcard_booking_links_status_chk check (status in ('open', 'booked', 'cancelled'));
exception when duplicate_object then null; end $$;

create index if not exists idx_vakilcard_links_profile on public.vakilcard_booking_links (profile_id, created_at desc);

-- Same posture as the other VakilCard tables: RLS on, no policies, reached only through the
-- server (service role).
alter table public.vakilcard_booking_links enable row level security;

alter table public.vakilcard_appointment_requests
  add column if not exists meeting_provider text,
  add column if not exists meeting_url text,
  add column if not exists client_email text,
  add column if not exists booking_link_id uuid;
