-- Google Business Profile live listing details (additive columns).
-- 2026-08-16 fix batch (item E): the Google Business tile previously showed
-- the lawyer's own manually-entered office address (mislabeled as if it
-- came from Google) and never surfaced opening hours at all — a genuinely
-- "static chip" despite claiming to be a live Google Business preview.
-- Populated by api/vakilcard/booking.js's storeBusinessConnection() from
-- the Business Information API's storefrontAddress/regularHours fields
-- (same OAuth call already made on connect, just a wider readMask — no new
-- scope, no re-consent needed for already-connected accounts to keep
-- working; they just won't have these two fields populated until they next
-- reconnect or a "Sync now" refresh is triggered).
alter table public.vakilcard_profiles
  add column if not exists google_business_address text,
  add column if not exists google_business_hours jsonb;
