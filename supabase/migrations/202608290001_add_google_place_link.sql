-- One-tap Google Business linking, via the Places API instead of OAuth.
--
-- WHY NOT OAUTH. The Business Profile API (business.manage) is a SENSITIVE
-- scope behind a manual Google approval gate: you need an Organization
-- account, a verified profile active 60+ days, an access-request form, and
-- Google's sign-off. Until they approve, your quota is literally 0 QPM. It is
-- also the wrong API -- it exists to MANAGE a listing you own (edit hours,
-- reply to reviews). VakilCard only needs to SHOW a public listing and
-- deep-link to its review form.
--
-- The Places API does exactly that with an API key: no OAuth, no consent
-- screen, no approval queue, and no sensitive scope on the advocate's Google
-- account. The owner types their chamber name, taps their listing, done --
-- which is the whole point (founder, 29 Aug: "we sell convenience to users").
--
-- It also returns MORE than the OAuth path ever did. The card component has
-- always been able to render a rating and review count
-- (design_system/vakilcard/ui_kits/vakilcard/VakilCardApp.jsx: "server-
-- supplied only"), but nothing could ever supply them. Places can.
--
-- All columns additive and nullable. Nothing reads them until populated, so
-- this is safe to land before or after the code that writes them.

alter table public.vakilcard_profiles
  -- The stable Google identifier for the listing. Everything else in this
  -- migration is a CACHE of what Places returned for this id, so a refresh is
  -- always possible from this one value.
  add column if not exists google_place_id text,
  -- Star rating and how many ratings it is averaged over. Cached rather than
  -- fetched per card view: a public card can be opened thousands of times and
  -- `rating`/`userRatingCount` bill on the Places Enterprise SKU. Refreshed
  -- when the owner re-links, not on the visitor's request path.
  add column if not exists google_rating numeric(2,1),
  add column if not exists google_review_count integer,
  -- When the cache above was last written, so a future refresh job (or a
  -- "refresh" button) can find stale rows without guessing.
  add column if not exists google_place_synced_at timestamptz;

comment on column public.vakilcard_profiles.google_place_id is
  'Google Places place ID for the owner''s Business Profile listing. Source of truth for the cached google_rating / google_review_count / google_business_url / google_review_link columns.';
comment on column public.vakilcard_profiles.google_review_link is
  'googleMapsLinks.writeAReviewUri from the Places API. Pro-gated at read time in api/vakilcard/profile.js. Before 2026-08-29 this was written by the Google Business OAuth flow and, briefly, by nothing at all.';
