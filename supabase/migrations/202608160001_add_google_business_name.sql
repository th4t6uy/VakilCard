-- Google Business Profile OAuth-verified listing name (additive column).
-- Populated by api/vakilcard/booking.js's gcal_callback (gmb_state branch)
-- alongside the existing google_business_embed / google_review_link writes
-- — the exact Google-verified listing title, so the card's Google Business
-- tile can show the real business name instead of falling back to the
-- lawyer's own office/chamber name once they've connected via OAuth.
alter table public.vakilcard_profiles
  add column if not exists google_business_name text;
