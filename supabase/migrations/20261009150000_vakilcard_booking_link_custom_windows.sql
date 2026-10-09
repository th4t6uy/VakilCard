-- Per-link "my own times": the lawyer can open specific date+time windows for one booking link,
-- even outside his weekly hours. Additive and nullable; null = use weekly hours as before.
-- Applied to production 2026-10-09 via the Supabase MCP.
alter table public.vakilcard_booking_links
  add column if not exists custom_windows jsonb;
comment on column public.vakilcard_booking_links.custom_windows is
  'Optional array of {start,end} ISO windows chosen by the lawyer for this link. Null = weekly hours.';
