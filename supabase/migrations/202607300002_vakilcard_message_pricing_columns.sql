-- VakilCard: message_log/wa_pricing_rates catch-up migration.
--
-- Root cause (confirmed by reading every existing migration + the only two
-- callers, api/vakilcard/_messaging.js send()/sendText()/logMessage()):
--   * message_log's table definition (202607180002) never included
--     `product`, `category`, or `estimated_cost_inr` — only `module` was
--     added later (202607180004). _messaging.js has always written
--     `product`, `category`, and `estimated_cost_inr` on every logMessage()
--     call (see send()/sendText() in _messaging.js) — application code is
--     correct and was simply ahead of an incomplete migration; this is not
--     dead/obsolete code and nothing needs to be removed.
--   * wa_pricing_rates was never created anywhere. _messaging.js's
--     getRates() already treats it as best-effort (try/catch + FALLBACK_RATES
--     of authentication/utility/marketing/service), so its absence never
--     broke sends, but it does explain the PGRST205 on every send. Since the
--     code and its own comments ("estimated cost is snapshotted into
--     message_log so the admin dashboard needs no joins") clearly intend
--     real per-category pricing to exist and be queryable, this migration
--     creates it and seeds it with the same values already hardcoded as
--     FALLBACK_RATES in _messaging.js — the correct source of truth pending
--     an admin UI to edit real Meta rates.

-- 1) message_log: columns _messaging.js has always sent.
alter table public.message_log add column if not exists product text;
alter table public.message_log add column if not exists category text;
alter table public.message_log add column if not exists estimated_cost_inr numeric(10,4);

-- 2) wa_pricing_rates: Meta per-message rates (INR) by category, read by
--    _messaging.js's getRates() (10-min in-process cache, FALLBACK_RATES on
--    any failure — so this table being briefly stale/unreachable is safe by
--    design). Same RLS posture as every other VakilCard table: deny-all,
--    service-role only (no policies == PostgREST anon/authenticated get
--    nothing; the API always calls through SUPABASE_SERVICE_ROLE_KEY, which
--    bypasses RLS).
create table if not exists public.wa_pricing_rates (
  category text primary key,
  rate_inr numeric(10,4) not null,
  updated_at timestamptz not null default now()
);
alter table public.wa_pricing_rates enable row level security;

insert into public.wa_pricing_rates (category, rate_inr) values
  ('authentication', 0.1150),
  ('utility', 0.1150),
  ('marketing', 0.7846),
  ('service', 0.0000)
on conflict (category) do nothing;

-- 3) Force an immediate PostgREST schema-cache reload so the API stops
--    returning PGRST204/PGRST205 for these on the very next request,
--    without waiting for Supabase's automatic DDL-triggered reload.
notify pgrst, 'reload schema';
