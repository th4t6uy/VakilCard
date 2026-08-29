-- VakilCard booking: gateway-verified payment + advocate notification.
-- 2026-08-29. ADDITIVE ONLY — no column is dropped, no CHECK constraint is
-- rewritten, so every existing row and every existing code path keeps working
-- unchanged if this migration is applied and the feature never turned on.
--
-- WHY NO NEW payment_status VALUE. `payment_status` already carries
-- ('not_required','pending','claimed_paid','confirmed'). Gateway-verified money
-- IS 'confirmed' — the money is real and the owner need not vouch for it. Adding
-- a fifth value would have forced a constraint rewrite plus a change to every
-- dashboard branch and the manage/confirm rules in api/vakilcard/booking.js, to
-- express something the existing vocabulary already says. What was genuinely
-- missing is PROVENANCE: who established that the money arrived. That is the
-- new payment_provider column, and it is the only thing that distinguishes an
-- owner's manual "yes, it landed" from Razorpay's word.

alter table public.vakilcard_appointment_requests
  -- null  = pre-existing row / no payment involved
  -- 'upi_manual' = the honour-system path: visitor self-reported, owner confirmed
  -- 'razorpay'   = confirmed by a Razorpay webhook re-fetched from their API
  add column if not exists payment_provider text
    check (payment_provider is null or payment_provider in ('upi_manual', 'razorpay')),
  add column if not exists razorpay_payment_link_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists paid_at timestamptz;

-- Idempotency at the DATABASE, not only in application code. The webhook also
-- checks before writing, but a duplicate delivery racing itself (Razorpay
-- retries on any non-2xx, and Vercel can run two invocations concurrently)
-- would slip past a check-then-write. This makes the second write fail loudly
-- instead of silently confirming an appointment twice.
create unique index if not exists uq_vakilcard_appt_rzp_payment
  on public.vakilcard_appointment_requests (razorpay_payment_id)
  where razorpay_payment_id is not null;

-- Webhook lookup path: Razorpay hands us a payment-link id, we find the row.
create index if not exists idx_vakilcard_appt_rzp_link
  on public.vakilcard_appointment_requests (razorpay_payment_link_id)
  where razorpay_payment_link_id is not null;

-- ---------------------------------------------------------------------------
-- Advocate booking alert (WhatsApp).
--
-- REGISTERED INACTIVE ON PURPOSE. A row here is OUR registry; it is not a Meta
-- approval. The precedent is in message_log: `vakilcard_welcome` was active in
-- this table and still failed at Meta with "(#132001) Template name does not
-- exist in the translation". `appointment_confirmation` and
-- `payment_confirmation` are likewise active here and have NEVER been sent by
-- anything in the estate — their approved parameter counts are unknown, so this
-- feature does not build on them.
--
-- Turn on only after the template is approved in Meta Business Manager with
-- EXACTLY these four body variables, in this order:
--     update public.message_templates set active = true
--      where name = 'vakilcard_booking_alert';
-- Until then MessagingService logs a 'skipped'/'template_missing' row and the
-- booking itself is entirely unaffected.
insert into public.message_templates (name, language, channel, provider_ref, description, category, active)
values (
  'vakilcard_booking_alert', 'en', 'whatsapp', 'vakilcard_booking_alert',
  'Advocate alert when a client books. {{1}}=client name, {{2}}=date & time (IST), {{3}}=payment line (amount received, or "No payment required"), {{4}}=dashboard URL. Utility category. INACTIVE until approved in Meta Business Manager with exactly these four variables.',
  'utility', false
)
on conflict (name) do nothing;
