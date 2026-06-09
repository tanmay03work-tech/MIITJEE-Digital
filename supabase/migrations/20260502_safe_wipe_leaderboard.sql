create or replace function public.wipe_leaderboard()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_ids uuid[] := '{}'::uuid[];
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  lock table public.test_attempts, public.test_attempt_answers in share row exclusive mode;

  select coalesce(array_agg(id order by submitted_at asc), '{}'::uuid[])
  into v_attempt_ids
  from public.test_attempts;

  if coalesce(array_length(v_attempt_ids, 1), 0) = 0 then
    perform public.refresh_admin_analytics();
    return 'leaderboard_wiped';
  end if;

  delete from public.test_attempts
  where id = any(v_attempt_ids);

  perform public.refresh_admin_analytics();

  return 'leaderboard_wiped';
end;
$$;

grant execute on function public.wipe_leaderboard() to authenticated;
