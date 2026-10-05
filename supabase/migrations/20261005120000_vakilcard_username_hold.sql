-- VakilCard: hold a custom link while the lawyer pays for it (founder, 5 Oct 2026).
-- Additive only. The app writes lower-case names (validateUsername), so plain
-- text is enough; the unique index stops two people holding the same link.
alter table public.vakilcard_profiles
  add column if not exists pending_username text,
  add column if not exists pending_username_until timestamptz;

create unique index if not exists vakilcard_profiles_pending_username_key
  on public.vakilcard_profiles (pending_username)
  where pending_username is not null;

comment on column public.vakilcard_profiles.pending_username is
  'Custom link held while the owner pays for Pro; applied on payment (api/vakilcard/_usernameSwitch.js).';
comment on column public.vakilcard_profiles.pending_username_until is
  'Hold expiry; after it the link counts as free again for other people.';
