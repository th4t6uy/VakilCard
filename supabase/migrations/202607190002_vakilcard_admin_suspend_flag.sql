-- Additive: lets an admin suspend a VakilCard independent of the owner's
-- own draft/publish toggle (is_published). Suspended cards render a
-- "temporarily unavailable" page regardless of is_published state.
alter table public.vakilcard_profiles
  add column if not exists is_suspended boolean not null default false;

comment on column public.vakilcard_profiles.is_suspended is
  'Admin-only suspension flag. When true, the public card page is replaced with a hold notice, overriding is_published. Set only via the VakilCard admin API.';
