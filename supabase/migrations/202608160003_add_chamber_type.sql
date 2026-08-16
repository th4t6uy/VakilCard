-- Chamber "type" caption (additive column) — the small all-caps label
-- rendered under the chamber name on the card (e.g. "LAW CHAMBERS",
-- "LEGAL ASSOCIATES", "ADVOCATES", "& CO"). Previously this was NEVER a
-- real field: toDsProfile()/formToDsProfile() derived it from any extra
-- words typed into chamber_name, and forced the literal "LAW CHAMBERS"
-- whenever chamber_name had 0 or 1 words — wrong for solo practitioners,
-- associates, or any non-chambers practice, and impossible to opt out of.
-- Now an explicit, independently editable, optional field (populated from
-- the SetupWizard's "Firm type" input, same step as chamber_name — see
-- api/vakilcard/me.js and src/pages/vakilcard/SetupWizard.js). Read via
-- the existing vakilcard_offices(*) wildcard select in api/vakilcard/_lib.js
-- and api/vakilcard/me.js, so no query changes were needed — safe to ship
-- ahead of this migration landing (falls back to the old word-split
-- behavior until it's actually populated).
alter table public.vakilcard_offices
  add column if not exists chamber_type text;
