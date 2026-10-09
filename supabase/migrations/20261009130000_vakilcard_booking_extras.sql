-- VakilCard booking links, round 2 (founder, 9 Oct 2026): Calendly-style extras.
--   Free : meeting length per link, gap between meetings, minimum notice
--   Pro  : reschedule / cancel by the client, reminder emails, reusable links
-- Additive only.
alter table public.vakilcard_profiles
  add column if not exists booking_buffer_minutes integer not null default 0,
  add column if not exists booking_min_notice_hours integer not null default 4;

alter table public.vakilcard_booking_links
  add column if not exists duration_minutes integer,
  add column if not exists reusable boolean not null default false,
  add column if not exists uses integer not null default 0;

alter table public.vakilcard_appointment_requests
  add column if not exists manage_token text,
  add column if not exists calendar_event_id text,
  add column if not exists calendar_id text,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rescheduled_count integer not null default 0;

create unique index if not exists uq_vakilcard_appt_manage_token
  on public.vakilcard_appointment_requests (manage_token) where manage_token is not null;
-- Cron lookup: confirmed meetings still waiting for their reminder.
create index if not exists idx_vakilcard_appt_reminder
  on public.vakilcard_appointment_requests (starts_at) where reminder_sent_at is null and status = 'confirmed';
