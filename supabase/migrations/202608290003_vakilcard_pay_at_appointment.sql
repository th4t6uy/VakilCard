-- VakilCard booking moves to PAY-AT-APPOINTMENT.
-- 2026-08-29. Founder decision: the consultation fee is paid directly to the
-- advocate, in person or on their own UPI, and Vakilpedia never receives,
-- holds, routes or verifies that money.
--
-- WHY THE PREPAID MODEL WAS RETIRED. A upi:// deep link hands control to the
-- payer's UPI app and the app returns nothing to the web page — a merchant
-- learns the outcome only from a provider's server-to-server callback or
-- status API, both of which require a provider relationship. So a payment made
-- directly to the advocate cannot be confirmed by us at all. The only rails
-- that could confirm it either put DatarOne in custody of client money (which
-- is Payment Aggregator activity under RBI's framework, and is prohibited by
-- the founder) or require every advocate to complete their own payment-provider
-- KYC. Neither is acceptable today, so the honest model is: the booking is
-- real, the fee is DUE, and nobody claims it has been verified.
-- Full assessment: Docs/VAKILCARD_PAYMENT_RAIL_FEASIBILITY_2026-08-29.md
--
-- WIDENING, NOT REWRITING. This only adds 'due' to the allowed values. Every
-- existing value stays legal, so no existing row changes or becomes invalid:
--   not_required  — no fee configured (unchanged)
--   due           — NEW: a fee is payable at the appointment, nothing collected
--   pending       — legacy: awaiting a prepayment that was never verifiable
--   claimed_paid  — legacy: the VISITOR's unverified word. Never written again.
--   confirmed     — the ADVOCATE recorded the money as received (still written)
-- 'pending' and 'claimed_paid' are retained ONLY so historical rows remain
-- readable and the owner can still resolve them. Nothing writes them now.

alter table public.vakilcard_appointment_requests
  drop constraint if exists vakilcard_appointment_requests_payment_status_check;

alter table public.vakilcard_appointment_requests
  add constraint vakilcard_appointment_requests_payment_status_check
  check (payment_status in ('not_required', 'due', 'pending', 'claimed_paid', 'confirmed'));

comment on column public.vakilcard_appointment_requests.payment_status is
  'not_required = no fee. due = payable at the appointment, nothing collected or verified. confirmed = the advocate recorded receipt. pending/claimed_paid = legacy prepaid states, never written after 2026-08-29.';

-- The razorpay_* columns and uq_vakilcard_appt_rzp_payment from 202608290002
-- are deliberately LEFT IN PLACE and are now dormant: nothing writes them, and
-- the code that did has been removed. They are kept rather than dropped so no
-- existing row is disturbed, and because they are the correct shape if the
-- advocate's-own-payment-provider model is ever revisited (see the assessment).
comment on column public.vakilcard_appointment_requests.razorpay_payment_link_id is
  'DORMANT since 2026-08-29 — the prepaid Payment Link flow was removed. Nothing writes this.';
