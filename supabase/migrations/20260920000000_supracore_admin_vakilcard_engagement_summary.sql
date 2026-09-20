-- ============================================================================
-- VakilCard — Admin Engagement Summary (2026-09-20)
--
-- The Project Bible ("Priority 3 — Mission Control") asks for "Cards created /
-- Shares / QR scans" in the admin console. That data has existed since the
-- very first VakilCard migration (public.vakilcard_analytics_events,
-- 202607180001) and VakilCard's own "me" endpoint already reads it for the
-- card OWNER's private stats -- but nothing in admin.vakilpedia.com (the
-- CaseLinx-hosted admin console, same hxv database) reads it. This migration
-- adds ONE read-only aggregate RPC. No new event table, no new instrumentation
-- -- view/share/qr_download/call/whatsapp/appointment/nfc_tap events are
-- already being written by api/vakilcard/_lib.js's trackEvent() on every
-- page load and action.
--
-- Same conventions as every other supracore_admin_* RPC in the estate:
-- security definer, service_role only, jsonb {ok, ...} / {ok:false, error}.
-- ============================================================================

begin;

create or replace function public.supracore_admin_vakilcard_engagement_summary(
  p_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_days     int := greatest(least(coalesce(p_days, 30), 90), 1);
  v_by_type  jsonb;
  v_top      jsonb;
  v_total    bigint;
  v_cards    bigint;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'eventType', x.event_type,
           'count', x.n
         ) order by x.n desc), '[]'::jsonb),
         coalesce(sum(x.n), 0)
  into v_by_type, v_total
  from (
    select event_type, count(*) as n
    from public.vakilcard_analytics_events
    where created_at >= now() - (v_days || ' days')::interval
    group by event_type
  ) x;

  -- Top 10 most-viewed cards in the window -- the "which cards perform" half
  -- of the founder's ask, not just a raw total.
  select coalesce(jsonb_agg(jsonb_build_object(
           'profileId', p.id,
           'username', p.username,
           'fullName', p.full_name,
           'views', t.views
         ) order by t.views desc), '[]'::jsonb)
  into v_top
  from (
    select profile_id, count(*) as views
    from public.vakilcard_analytics_events
    where event_type = 'view'
      and created_at >= now() - (v_days || ' days')::interval
    group by profile_id
    order by count(*) desc
    limit 10
  ) t
  join public.vakilcard_profiles p on p.id = t.profile_id;

  select count(*) into v_cards from public.vakilcard_profiles where is_published = true;

  return jsonb_build_object(
    'ok', true,
    'days', v_days,
    'publishedCards', coalesce(v_cards, 0),
    'totalEvents', coalesce(v_total, 0),
    'byEventType', coalesce(v_by_type, '[]'::jsonb),
    'topViewed', coalesce(v_top, '[]'::jsonb)
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$fn$;

revoke all on function public.supracore_admin_vakilcard_engagement_summary(int)
  from public, anon, authenticated;
grant execute on function public.supracore_admin_vakilcard_engagement_summary(int)
  to service_role;

commit;
