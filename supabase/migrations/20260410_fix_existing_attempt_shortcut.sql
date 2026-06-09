create or replace function public.get_existing_attempt_for_test(p_test_id uuid)
returns table (
  id uuid,
  test_id uuid,
  user_id uuid,
  score integer,
  correct_answers integer,
  total_questions integer,
  rank integer,
  percentile integer,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_attempt public.test_attempts;
  v_rank integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select a.*
  into v_attempt
  from public.test_attempts a
  where a.test_id = p_test_id
    and (
      v_is_admin
      or a.user_id = v_uid
    )
  order by a.submitted_at desc
  limit 1;

  if v_attempt.id is null then
    return;
  end if;

  select
    ranked.rank
  into v_rank
  from (
    select
      a.id,
      dense_rank() over (
        partition by a.test_id, coalesce(t.batch_id, p.batch_id)
        order by a.score desc, a.percentile desc, a.submitted_at asc
      )::int as rank
    from public.test_attempts a
    join public.tests t on t.id = a.test_id
    join public.profiles p on p.id = a.user_id
    where a.test_id = v_attempt.test_id
  ) ranked
  where ranked.id = v_attempt.id;

  return query
  select
    v_attempt.id,
    v_attempt.test_id,
    v_attempt.user_id,
    v_attempt.score,
    v_attempt.correct_answers,
    v_attempt.total_questions,
    coalesce(v_rank, 0),
    v_attempt.percentile,
    v_attempt.submitted_at;
end;
$$;

grant execute on function public.get_existing_attempt_for_test(uuid) to authenticated;
