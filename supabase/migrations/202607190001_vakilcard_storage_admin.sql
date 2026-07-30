-- VakilCard sprint: upload formats + Admin Panel live visibility (additive).
-- Originally applied to hxvnsywaplmzpyxyuuxl (Vakilpedia/CaseLinx project)
-- — never run against GLC's project.
--
-- Repaired 2026-07-29 for forward compatibility with fresh/isolated
-- projects (see supabase/CLAUDE.md migration-history repair notes):
--  * Section 1 now CREATES the `vakilcard` bucket (upsert) instead of only
--    UPDATEing it. The original UPDATE silently affected 0 rows on any
--    project where the bucket had only ever been created ad hoc via the
--    dashboard, so a fresh `supabase db push` produced a database with no
--    storage bucket at all — image upload would fail with no migration
--    error to explain why.
--  * Section 2's admin-read policies depend on `public.profiles`
--    (CaseLinx's own admin table), which does not exist in an
--    isolated/standalone VakilCard project. `create policy` validates
--    table references at creation time, so this used to abort the whole
--    migration on such projects. The policies are now created only when
--    `public.profiles` is present — no behavior change on the shared
--    Vakilpedia/CaseLinx project, no hard failure anywhere else.

-- 1) Storage: create-or-update the `vakilcard` bucket so it exists on a
--    fresh project, and accept the client pipeline's full format set.
--    WebP stays the preferred encoding; PNG (transparency / lossless QR)
--    and JPEG (Safari fallback — no WebP encoder in canvas.toBlob) are
--    valid too. The server endpoint still sniffs magic bytes and enforces
--    its own 400 KB cap. Public bucket: card photos/QRs are served via the
--    public object URL (api/vakilcard/upload.js), so anonymous read must
--    be allowed at the bucket level.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values ('vakilcard', 'vakilcard', true,
        array['image/webp','image/png','image/jpeg'], 512000)
on conflict (id) do update
  set public             = excluded.public,
      allowed_mime_types  = excluded.allowed_mime_types,
      file_size_limit     = excluded.file_size_limit;

-- 2) Admin Panel (CaseLinx app /admin) reads the CANONICAL identity tables
--    directly + live via Supabase Realtime. Mirrors the existing
--    platform_admin_can_read_* pattern (profiles.is_admin gate); all other
--    access remains deny-all/service-role. Guarded: only runs where
--    public.profiles exists (the shared Vakilpedia/CaseLinx project).
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists platform_admin_can_read_vakilpedia_accounts on public.vakilpedia_accounts';
    execute $pol$
      create policy platform_admin_can_read_vakilpedia_accounts
        on public.vakilpedia_accounts for select
        using (exists (select 1 from public.profiles
                        where profiles.id = auth.uid() and profiles.is_admin = true))
    $pol$;

    execute 'drop policy if exists platform_admin_can_read_vakilcard_profiles on public.vakilcard_profiles';
    execute $pol$
      create policy platform_admin_can_read_vakilcard_profiles
        on public.vakilcard_profiles for select
        using (exists (select 1 from public.profiles
                        where profiles.id = auth.uid() and profiles.is_admin = true))
    $pol$;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'vakilpedia_accounts') then
    alter publication supabase_realtime add table public.vakilpedia_accounts;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'vakilcard_profiles') then
    alter publication supabase_realtime add table public.vakilcard_profiles;
  end if;
end $$;

-- 3) Template registry doc fix: the approved Meta `vakilcard_welcome`
--    template takes exactly ONE variable ({{1}} = permanent card URL).
update public.message_templates
   set description = 'Post-verification welcome: {{1}} = permanent card URL. Utility category (Meta-approved).'
 where name = 'vakilcard_welcome';
