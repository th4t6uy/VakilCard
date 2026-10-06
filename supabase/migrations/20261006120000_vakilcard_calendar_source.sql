-- VakilCard appointments: which Google Calendar they go into (founder, 6 Oct 2026).
-- Appointments are a Pro feature. A Pro lawyer picks the calendar in the slot builder:
--   'vakilcard' -> the Google Calendar connected inside VakilCard (vakilcard_calendar_connections)
--   'caselinx'  -> the calendar of one of their CaseLinx workspaces (firm or personal), the same
--                  calendar CaseLinx puts hearings in, so hearings and appointments show together.
--                  Needs the Rs100/month VakilCard-CaseLinx connection (bundle CARD / ULTRA).
-- Additive only.
alter table public.vakilcard_profiles
  add column if not exists calendar_source text not null default 'vakilcard',
  add column if not exists calendar_firm_id uuid;

do $$ begin
  alter table public.vakilcard_profiles
    add constraint vakilcard_profiles_calendar_source_chk check (calendar_source in ('vakilcard', 'caselinx'));
exception when duplicate_object then null; end $$;

-- The CaseLinx workspaces (firm and personal) this account belongs to, with whether each has a
-- Google Calendar connected in CaseLinx. Tokens never leave CaseLinx: VakilCard asks CaseLinx for
-- a short-lived access token (CaseLinx route api/internal/vakilcard-calendar).
create or replace function public.vakilcard_calendar_choices(p_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, supracore, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'firm_id', f.id,
           'kind', w.kind,
           'name', coalesce(nullif(f.name, ''), w.name),
           'connected', cc.id is not null,
           'calendar', case when cc.id is not null then coalesce(nullif(f.calendar_id, ''), cc.account_email) end
         ) order by (w.kind = 'firm') desc, f.name), '[]'::jsonb)
    from supracore.memberships m
    join supracore.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    join public.firms f on f.workspace_id = w.id
    left join public.cloud_connections cc on cc.firm_id = f.id and cc.provider = 'google_drive'
   where m.account_id = p_account_id
     and m.status = 'active'
     and m.removed_at is null;
$$;
revoke all on function public.vakilcard_calendar_choices(uuid) from public, anon, authenticated;
grant execute on function public.vakilcard_calendar_choices(uuid) to service_role;
