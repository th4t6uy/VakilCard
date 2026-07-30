-- Missing-column fix (found 2026-07-30 during first standalone-beta runtime
-- audit): api/vakilcard/auth.js's password credential path (login_password /
-- set_password / change_password) and account.js's has_password check all
-- read/write public.vakilpedia_accounts.password_hash and .password_set_at
-- (self-describing scrypt string, see api/vakilcard/_password.js) — but no
-- migration ever added these columns. Every password operation failed with
-- PostgREST's "Could not find the 'password_hash' column of
-- 'vakilpedia_accounts'" (logged server-side, surfaced to the client as a
-- generic server_error). This is a required, actively-used feature (password
-- is documented as the PRIMARY re-login credential — OTP costs money per
-- WhatsApp send — see SignupPage.js), not dead code, so the fix is additive
-- DDL, not code removal.
alter table public.vakilpedia_accounts
  add column if not exists password_hash text,
  add column if not exists password_set_at timestamptz;
