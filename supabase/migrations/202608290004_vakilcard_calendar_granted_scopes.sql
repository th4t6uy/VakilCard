-- Record WHICH Google scopes a calendar connection was actually granted.
-- 2026-08-29.
--
-- WHY. GCAL_SCOPE changed from calendar.freebusy to calendar.events in ab08f87.
-- A refresh token issued BEFORE that change still only carries free/busy, so an
-- attempt to write an event with it fails 403 — and without this column the
-- code cannot tell that apart from any other Google error. It would appear to
-- the advocate as "the calendar feature silently does nothing", which is the
-- failure mode this estate keeps repeating.
--
-- Nullable on purpose: existing rows predate the change and their true scope is
-- unknown. NULL therefore means "unknown, try it and find out", which is the
-- correct behaviour — the write is attempted, and a 403 is reported as
-- "reconnect your calendar" rather than swallowed.
alter table public.vakilcard_calendar_connections
  add column if not exists granted_scopes text;

comment on column public.vakilcard_calendar_connections.granted_scopes is
  'Space-separated OAuth scopes Google actually returned at consent. NULL = granted before this was recorded; treat as unknown, not as absent.';
