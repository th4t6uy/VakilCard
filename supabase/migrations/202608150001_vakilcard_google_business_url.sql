-- Google Business tile (Pro): the owner's Google Business Profile link.
-- The card's native-style Google Business tile opens this externally;
-- when unset, profile.js falls back to the office's maps_url.
-- Additive + nullable — safe on live data, no backfill needed.
alter table public.vakilcard_profiles
  add column if not exists google_business_url text;
