# VakilCard API

Serverless (Vercel), dependency-free Node. Data: Supabase `hxvnsywaplmzpyxyuuxl`
via PostgREST with the service-role key — every `vakilcard_*` / identity table is
RLS **deny-all**; nothing is readable with the anon key.

## Environment

| Var | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | required — all DB access |
| `SUPABASE_URL` | optional (defaults to the project URL) |
| `VAKILPEDIA_AUTH_SECRET` | required — signs session JWTs and HMACs verification codes |
| `FIREBASE_API_KEY` | required for Google identity (token verification) |
| `WA_PHONE_ID`, `WA_TOKEN` | Meta WhatsApp Business API (same values as the Render backend) |
| `VERIFICATION_PROVIDER` | `whatsapp` (default) or `console` (dev: codes to logs only) |

## Identity model

Phone (WhatsApp-verified) is the **primary** identity; Google is optional and
linkable later. One `vakilpedia_accounts` row owns any number of
`account_phone_identities` and `account_oauth_identities`. Every endpoint
accepts `Authorization: Bearer <token>` where token is either a VakilCard
session JWT (issued by `auth` verify) or a Firebase ID token.

## Endpoints

### `POST /api/vakilcard/auth`
Actions (JSON body `{action, ...}`):
- `start` — `{phone, device_fingerprint?}` → sends a 6-digit code via WhatsApp.
  Codes: HMAC-hashed (never stored raw), 5-min expiry, 5 attempts,
  60s resend cooldown, 5 sessions/phone/hour, 15/IP/hour. Errors: `invalid_phone`,
  `cooldown`/`rate_limited` (HTTP 429 + `retryAfterSec`), `delivery_failed`.
- `verify` — `{phone, code}` → on success **creates account + DRAFT VakilCard**
  (username = phone number, URL reserved, NOT public until published), sends
  the templated welcome (setup + reserved address), returns
  `{access_token, refresh_token, expires_in, token (compat), account_id,
  created, username, published, card_url, setup_url}`.
- `refresh` — `{refresh_token}` → rotating refresh (old token revoked; reuse
  of a rotated token revokes the whole family). 401 on invalid/expired/reused.
- `logout` — `{refresh_token}` → revokes it.
- `resend` — same rules as `start`.
- `status` — latest session state for a phone.

Token strategy: 1h stateless access JWT + 60d rotating opaque refresh token
(hash-stored). See `docs/VAKILCARD_IDENTITY.md` for the full policy, draft
publishing rules, username validation policy and the reserved-username system
(DB-backed: `reserved_usernames` with category/reason/expiry/enabled — new
reservations are an INSERT, no deploy).

### `GET/POST/DELETE /api/vakilcard/me` (auth)
Profile bundle CRUD. `GET ?check=<name>` = username availability (checks
reserved names, profiles, aliases). `POST` creates/updates the profile
(username set only at creation — renames must use `account`).

### `GET/POST /api/vakilcard/account` (auth)
- `GET` — identities + aliases overview.
- `change_username` — `{username}` (3–30, `a-z 0-9 _ - .`); old username becomes
  a **permanent-redirect alias** + `vakilcard_username_history` row. Links never break.
- `link_google` — `{id_token}` (Firebase); refuses if linked to another account.
- `unlink_google` — refused if it would strand the account (no verified phone).

### `GET /:username` → `api/vakilcard/profile`
Server-rendered public card (OG/Twitter/JSON-LD, edge-cached 300s).
Aliases (old phone URL, previous usernames) return **301** to the primary
username. Unknown → branded 404 with claim CTA.

### `GET /api/vakilcard/vcf?username=` — vCard download (follows aliases).
### `POST /api/vakilcard/track` — sendBeacon analytics (whitelisted event types).

## Messaging

Template-driven only (`message_templates` registry → provider template ref;
all sends logged in `message_log`). Registered: `phone_verification_code`
(Meta auth template `vakilpedia_otp`, approved) and `vakilcard_welcome`
(**requires Meta Business Manager approval before welcomes deliver** — failures
are logged, never block onboarding).

## Tests

`node tests/vakilcard-verification.test.js` — verification pipeline + JWT
(no network/DB; in-memory PostgREST stub, console provider).
