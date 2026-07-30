-- VakilCard Phase 2.5: final identity hardening (applied to hxvnsywaplmzpyxyuuxl 2026-07-18).
-- Additive + constraint tightening; no data-destructive changes.

create extension if not exists pgcrypto;

-- 1) Permanent internal public account identifier (acc_<18 hex>). Immutable,
--    internal-only; uuid PK remains the relational key everywhere.
alter table public.vakilpedia_accounts
  add column if not exists public_id text unique not null
  default ('acc_' || replace(gen_random_uuid()::text, '-', ''));

-- 2) Refresh tokens: opaque tokens, hash-stored, rotating, revocable.
create table if not exists public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vakilpedia_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  rotated_from uuid,
  revoked_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_refresh_tokens_account on public.refresh_tokens (account_id, created_at desc);
alter table public.refresh_tokens enable row level security;

-- 3) Draft-first onboarding: new cards start unpublished.
alter table public.vakilcard_profiles alter column is_published set default false;

-- 4) Tightened username rules (also applies to aliases):
--    3-30 chars, lowercase alnum segments, single . _ - separators between
--    segments only (no leading/trailing/consecutive separators).
alter table public.vakilcard_profiles drop constraint if exists vakilcard_profiles_username_check;
alter table public.vakilcard_profiles add constraint vakilcard_profiles_username_check
  check (username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and char_length(username) between 3 and 30);
alter table public.vakilcard_aliases drop constraint if exists vakilcard_aliases_alias_check;
alter table public.vakilcard_aliases add constraint vakilcard_aliases_alias_check
  check (alias ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and char_length(alias) between 3 and 30);

-- 5) Database-backed reserved-username system (replaces any hardcoded lists).
alter table public.reserved_usernames add column if not exists category text not null default 'general';
alter table public.reserved_usernames add column if not exists reason text;
alter table public.reserved_usernames add column if not exists created_at timestamptz not null default now();
alter table public.reserved_usernames add column if not exists expires_at timestamptz;
alter table public.reserved_usernames add column if not exists created_by text not null default 'system';
alter table public.reserved_usernames add column if not exists enabled boolean not null default true;

-- 6) Messaging: module tag (authentication/utility/notification/reminder/marketing/...).
alter table public.message_log add column if not exists module text;

-- 7) Seed. Upsert so existing rows gain categories.
do $$
declare
  cat text; n text;
  seeds jsonb := '{
    "authentication": ["login","logout","signin","signout","register","signup","join","invite","verify","verification","auth","authenticate","password","reset","forgot","magic","session","token","account","accounts","profile","profiles","preferences","settings","me","my","mine"],
    "platform": ["app","apps","dashboard","console","panel","workspace","home","start","launch","shell","desktop"],
    "company": ["vakilpedia","vakilcard","caselinx","courtlinx","courtque","evidencehash","lexdraft","barelex","vakil","support","vakilnama","tester"],
    "legal": ["law","laws","lawyer","lawyers","advocate","advocates","counsel","firm","firms","chambers","court","courts","judge","judges","justice","judgment","judgements","judiciary","litigation","legal","practice","cases","case","filing","petition","appeal","order","notice","contract","contracts","agreement","agreements","evidence","documents","draft","drafts","template","templates"],
    "marketing": ["about","contact","pricing","plans","enterprise","business","company","team","careers","jobs","press","media","blog","blogs","news","updates","roadmap","partners","affiliate","community","network"],
    "support": ["help","faq","docs","documentation","guide","tutorial","academy","learn","status"],
    "legal_pages": ["privacy","terms","policy","cookies","security","trust","compliance","licenses","license","dmca","abuse","report","refunds","shipping"],
    "api": ["api","graphql","rest","rpc","oauth","callback","webhook","webhooks","integrations","integration","developer","developers","sdk","cli"],
    "assets": ["static","assets","files","uploads","download","downloads","images","img","css","js","fonts","icons","favicon","robots","sitemap","manifest"],
    "commerce": ["billing","payments","payment","checkout","cart","invoice","subscription","subscriptions","wallet","credits"],
    "communication": ["email","mail","sms","phone","whatsapp","chat","messages","notifications","alerts"],
    "search": ["search","find","discover","directory","directories","explore","browse","categories"],
    "admin": ["admin","administrator","superadmin","owner","root","system","internal","ops","operations","staff","moderator","mod"],
    "infrastructure": ["cdn","storage","edge","proxy","cache","metrics","monitor","logs","analytics","health","ping"],
    "future_products": ["ai","assistant","copilot","agent","agents","workflow","automation","calendar","drive","forms","appointments","book","booking","office","offices"],
    "brand_reserve": ["briefcase","briefs","research","vault","timeline","hearing","hearingboard","reception","intake","clients","client","matter","matters","archive","library","knowledge","precedents","citations","notebook","notes","tasks","activity"],
    "numbers": ["100","101","102","108","112","911","999","181","139","1091","1098","1930","14567"],
    "routes": ["tools","ipc-to-bns-converter","evidence-hash-sha256","ipcbnsconverter","evidence-hash","ipc-420-bns","ipc-302-bns","products","setup"]
  }'::jsonb;
begin
  for cat in select jsonb_object_keys(seeds) loop
    for n in select jsonb_array_elements_text(seeds->cat) loop
      insert into public.reserved_usernames (username, category, reason, created_by)
      values (n, cat, 'phase 2.5 hardening seed', 'migration_20260718')
      on conflict (username) do update
        set category = excluded.category, enabled = true;
    end loop;
  end loop;
end $$;

-- Policy notes (enforced in application validation, documented here):
--  * 1- and 2-character usernames are rejected by the 3-char minimum — the
--    entire short namespace is thereby preserved without seeding thousands
--    of rows.
--  * Purely numeric usernames cannot be chosen by users at all; only
--    system-assigned phone usernames are numeric. Emergency/common service
--    numbers above are seeded as defense-in-depth.
--  * Usernames are never recycled: aliases + username_history rows are kept
--    forever, and availability checks treat any alias as taken.
