-- Phase 5: Google Business Profile map embed URL (additive column).
alter table public.vakilcard_profiles
  add column if not exists google_business_embed text;
