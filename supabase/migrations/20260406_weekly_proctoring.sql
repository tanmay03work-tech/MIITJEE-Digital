alter table public.rate_limit_events enable row level security;

drop policy if exists rate_limit_events_admin_select on public.rate_limit_events;
create policy rate_limit_events_admin_select on public.rate_limit_events
for select using (public.is_admin());

drop policy if exists rate_limit_events_self_insert on public.rate_limit_events;
create policy rate_limit_events_self_insert on public.rate_limit_events
for insert
with check (
  actor_id = auth.uid()
  and action in ('app_background', 'app_inactive')
);

grant insert, select on public.rate_limit_events to authenticated;
grant usage, select on sequence public.rate_limit_events_id_seq to authenticated;

create index if not exists idx_rate_limit_events_actor_created_at
  on public.rate_limit_events (actor_id, created_at desc);

create index if not exists idx_rate_limit_events_action_bucket
  on public.rate_limit_events (action, window_bucket desc);

create or replace view public.admin_violation_summary
with (security_invoker = true) as
with last_events as (
  select distinct on (r.actor_id)
    r.actor_id,
    r.action as last_violation_type,
    r.created_at as last_violation_at
  from public.rate_limit_events r
  order by r.actor_id, r.created_at desc
)
select
  p.id as user_id,
  p.full_name,
  p.email,
  p.batch_id,
  count(r.id)::int as violation_count,
  le.last_violation_at,
  le.last_violation_type,
  (count(r.id) >= 3) as is_suspicious
from public.profiles p
join public.rate_limit_events r on r.actor_id = p.id
left join last_events le on le.actor_id = p.id
group by p.id, p.full_name, p.email, p.batch_id, le.last_violation_at, le.last_violation_type
order by violation_count desc, le.last_violation_at desc nulls last;

grant select on public.admin_violation_summary to authenticated;
