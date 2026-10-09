alter table public.vakilcard_booking_links add column if not exists fee_set boolean not null default false;
alter table public.vakilcard_booking_links add column if not exists fee_inr integer;
