# VakilCard

Standalone digital chamber card product — extracted from `Apps/Vakilpedia-website` on 2026-07-29.

## Status

This is a **source-code extraction, not yet a deployment cutover**. The live, production VakilCard
(public card, wizard, admin) is still served by `Apps/Vakilpedia-website`'s Vercel deployment —
nothing about that deployment changed. This app is a standalone, independently buildable copy of
VakilCard's own code, ready for a future, separately-gated deployment cutover (own Vercel project,
own domain/DNS, own env vars) once you decide to make one.

Verified locally in this extraction pass:
- `npm install && npm run build` — clean production build (CRA/craco), no errors.
- `npm test` — all 30 existing VakilCard unit tests pass unmodified (verification, entitlements,
  onboarding, upload). Two test files (`vakilcard-entitlements.test.js`,
  `vakilcard-onboarding.test.js`) had hardcoded `../frontend/...` require paths from the old repo
  layout; those two `path.join(...)` calls were updated to match this repo's flatter layout
  (`api/vakilcard/...`, `src/...` instead of `frontend/api/vakilcard/...`, `frontend/src/...`).
  No test logic changed.

## What's here vs. what's still in Vakilpedia-website

**Copied here (VakilCard-owned):** all VakilCard pages (`src/pages/{VakilCardPage,vakilcard/*}.js`),
VakilCard-only lib/components, the VakilCard design system (`design_system/`), the 19 serverless API
functions (`api/vakilcard/*.js`), VakilCard's 8 Supabase migrations (`supabase/migrations/`, reference
copies — the applied migration history of record remains in Vakilpedia-website), and its 4 test files.

**Duplicated here, not moved (Shared class — see extraction report):**
`src/components/{BrandWordmark,SEOHead}.js`, `src/index.css`. These are also used by other products
in Vakilpedia-website (EvidenceHash, the marketing pages, etc.) — copied here so this app is
self-contained, canonical originals remain in Vakilpedia-website. If they drift, reconcile manually;
no shared package was introduced for this pass (per the mission's "no unnecessary abstraction").

**Historical note:** `src/firebase.js` (Firebase Web SDK init, used only for optional Google
Sign-In) was duplicated here at extraction time but has since been removed entirely — 2026-07-30,
"remove Firebase completely". Authentication is WhatsApp OTP + Supabase + this app's own JWT
session/token system only. See `supabase/migrations/202607180001_vakilcard_mvp_schema.sql` and
`202607180002_vakilcard_identity_phase2.sql` for the (now-historical, unedited) `firebase_uid`
column and `'firebase'` oauth-provider value — inert schema, kept as applied-migration history
rather than rewritten.

**Not moved (stays in Vakilpedia-website):**
- The stale-looking duplicate API directory at Vakilpedia-website's repo root (`api/vakilcard/*.js`,
  13 files, missing 6 endpoints present here) — left untouched; not proven dead, see extraction report.
- `backend/whatsapp.py` / `backend/messaging.py` (Python) — shared WhatsApp router/messaging plane
  used by multiple products; only two handler functions in `whatsapp.py` are VakilCard-specific.
  Left as shared infra per the Phase 2 classification.
- CaseLinx's 3-file admin bridge (`config/platform/manifests/vakilcard.ts`,
  `app/actions/vakilcardAdminActions.ts`, `app/admin/products/vakilcard/cards/page.tsx`) — left in
  CaseLinx per your instruction; it's CaseLinx's own admin-console tooling about VakilCard, not
  VakilCard's code (see the Phase 2/3 report for why).

## Routes (unchanged from production)

`/vakilcard`, `/vakilcard/:username/dashboard`, `/vakilcard/signup` (redirect), `/vakilcard/setup`,
`/vakilcard/admin` — copied verbatim from `Apps/Vakilpedia-website/frontend/src/App.js`. `/api/vakilcard/*`
serverless functions keep their original paths. `CARD_ORIGIN` in `VakilCardPage.js` still points at
`https://www.vakilpedia.com` (unchanged) since that's still where VakilCard is publicly reachable today.

## Environment

See `.env.example`. Same variable names as production today; values are not carried over.

## Running locally

```
npm install
npm run build     # or: npm start
npm test
```

## Manual git setup (not done by this extraction — git was explicitly out of scope)

```
cd Apps/VakilCard
git init
git add -A
git commit -m "Initial extraction of VakilCard from Apps/Vakilpedia-website"
```

Then, when ready to actually deploy this standalone (separate step, own workstream):
link a new Vercel project rooted here, add the env vars in `.env.example`, and only then plan the
DNS/rewrite cutover away from Vakilpedia-website's current serving of `/vakilcard*` and `/api/vakilcard/*`.
