do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'leaderboard_scope'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.leaderboard_scope as enum ('overall_history', 'test_wise');
  end if;
end
$$;

create or replace function public.recalculate_test_attempt_percentiles(
  p_test_id uuid,
  p_batch_id text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  with cohort as (
    select
      a.id,
      a.score
    from public.test_attempts a
    join public.profiles p on p.id = a.user_id
    join public.tests t on t.id = a.test_id
    where a.test_id = p_test_id
      and coalesce(t.batch_id, p.batch_id) is not distinct from p_batch_id
  ),
  ranked as (
    select
      left_attempt.id,
      case
        when count(right_attempt.id) <= 1 then 100
        else round(
          (
            (
              count(*) filter (where right_attempt.score < left_attempt.score)
              + 0.5 * count(*) filter (where right_attempt.score = left_attempt.score)
            ) / count(right_attempt.id)::numeric
          ) * 100
        )::int
      end as percentile
    from cohort left_attempt
    join cohort right_attempt on true
    group by left_attempt.id
  )
  update public.test_attempts attempts
  set percentile = ranked.percentile
  from ranked
  where attempts.id = ranked.id;
$$;

drop view if exists public.test_attempt_summaries;

create view public.test_attempt_summaries
with (security_invoker = true) as
select
  a.id,
  a.test_id,
  a.user_id,
  coalesce(t.batch_id, p.batch_id) as batch_id,
  a.score,
  a.correct_answers,
  a.total_questions,
  dense_rank() over (
    partition by a.test_id, coalesce(t.batch_id, p.batch_id)
    order by a.score desc, a.percentile desc, a.submitted_at asc
  )::int as rank,
  a.percentile,
  a.submitted_at
from public.test_attempts a
join public.profiles p on p.id = a.user_id
join public.tests t on t.id = a.test_id;

create or replace view public.leaderboard_live
with (security_invoker = true) as
select
  ranked.user_id,
  ranked.full_name,
  ranked.batch_id,
  ranked.score,
  ranked.rank,
  ranked.percentile,
  ranked.tests_attempted
from (
  select
    p.id as user_id,
    p.full_name,
    p.batch_id,
    coalesce(round(avg(a.score)), 0)::int as score,
    coalesce(round(avg(a.percentile)), 0)::int as percentile,
    count(a.id)::int as tests_attempted,
    dense_rank() over (
      partition by p.batch_id
      order by avg(a.score) desc nulls last, avg(a.percentile) desc nulls last, count(a.id) desc, p.full_name asc
    )::int as rank
  from public.profiles p
  left join public.test_attempts a on a.user_id = p.id
  where p.role in ('student', 'miitjee_student')
  group by p.id, p.full_name, p.batch_id
) ranked
where ranked.tests_attempted > 0
order by ranked.batch_id asc nulls last, ranked.rank asc, ranked.full_name asc;

create or replace function public.get_leaderboard(
  p_scope public.leaderboard_scope default 'overall_history',
  p_batch_id text default null,
  p_test_id uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  batch_id text,
  score integer,
  percentile integer,
  rank integer,
  tests_attempted integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_effective_batch_id text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_is_admin then
    v_effective_batch_id := p_batch_id;
  else
    select p.batch_id
    into v_effective_batch_id
    from public.profiles p
    where p.id = v_uid;
  end if;

  if p_scope = 'test_wise' and p_test_id is null then
    raise exception 'Test selection is required for test-wise leaderboard';
  end if;

  if p_scope = 'overall_history' then
    return query
    with ranked as (
      select
        p.id as user_id,
        p.full_name,
        p.batch_id,
        round(avg(a.score))::int as score,
        round(avg(a.percentile))::int as percentile,
        count(a.id)::int as tests_attempted,
        dense_rank() over (
          order by avg(a.score) desc, avg(a.percentile) desc, count(a.id) desc, p.full_name asc
        )::int as rank
      from public.profiles p
      join public.test_attempts a on a.user_id = p.id
      where p.role in ('student', 'miitjee_student')
        and p.batch_id is not distinct from v_effective_batch_id
      group by p.id, p.full_name, p.batch_id
    )
    select
      ranked.user_id,
      ranked.full_name,
      ranked.batch_id,
      ranked.score,
      ranked.percentile,
      ranked.rank,
      ranked.tests_attempted
    from ranked
    order by ranked.rank asc, ranked.full_name asc;

    return;
  end if;

  return query
  with ranked as (
    select
      a.user_id,
      p.full_name,
      coalesce(t.batch_id, p.batch_id) as batch_id,
      a.score,
      a.percentile,
      1::int as tests_attempted,
      dense_rank() over (
        order by a.score desc, a.percentile desc, a.submitted_at asc
      )::int as rank
    from public.test_attempts a
    join public.profiles p on p.id = a.user_id
    join public.tests t on t.id = a.test_id
    where a.test_id = p_test_id
      and coalesce(t.batch_id, p.batch_id) is not distinct from v_effective_batch_id
  )
  select
    ranked.user_id,
    ranked.full_name,
    ranked.batch_id,
    ranked.score,
    ranked.percentile,
    ranked.rank,
    ranked.tests_attempted
  from ranked
  order by ranked.rank asc, ranked.full_name asc;
end;
$$;

create or replace function public.get_test_leaderboard(p_test_id uuid)
returns table (
  user_id uuid,
  full_name text,
  batch_id text,
  score integer,
  percentile integer,
  rank integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    coalesce(t.batch_id, p.batch_id)
  into v_batch_id
  from public.tests t
  left join public.profiles p on p.id = v_uid
  where t.id = p_test_id;

  return query
  select
    lb.user_id,
    lb.full_name,
    lb.batch_id,
    lb.score,
    lb.percentile,
    lb.rank
  from public.get_leaderboard('test_wise', v_batch_id, p_test_id) lb;
end;
$$;

create or replace function public.submit_test_attempt(
  p_test_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total_questions integer := 0;
  v_correct_answers integer := 0;
  v_score integer := 0;
  v_attempt public.test_attempts;
  v_user jsonb;
  v_result jsonb;
  v_leaderboard jsonb;
  v_overall_leaderboard jsonb;
  v_profile public.profiles;
  v_test public.tests;
  v_leaderboard_batch_id text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
    from public.test_attempts
    where test_id = p_test_id
      and user_id = v_uid
  ) then
    raise exception 'You have already given this test.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_uid;

  select *
  into v_test
  from public.tests
  where id = p_test_id
    and is_published = true;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if not public.is_admin() and not coalesce(v_test.is_started, false) then
    raise exception 'This test is locked until an admin starts it.';
  end if;

  if v_test.type = 'weekly' and not public.is_admin() then
    if not (
      v_profile.batch_id is not null
      and v_profile.batch_id = v_test.batch_id
    ) then
      raise exception 'Weekly tests are only for students of the matching batch';
    end if;
  end if;

  if v_test.type = 'scholarship' then
    if not exists (
      select 1
      from public.scholarship_registrations
      where test_id = p_test_id
        and user_id = v_uid
    ) then
      raise exception 'Scholarship registration is required before starting the test';
    end if;
  end if;

  select count(*)::int
  into v_total_questions
  from public.test_questions
  where test_id = p_test_id;

  select count(*)::int
  into v_correct_answers
  from public.test_questions q
  where q.test_id = p_test_id
    and coalesce(
      case
        when q.question_type = 'mcq' then q.correct_answer = coalesce(p_answers ->> q.id::text, '')
        when q.question_type = 'integer' then q.integer_answer is not null and coalesce(p_answers ->> q.id::text, '') = q.integer_answer::text
        else false
      end,
      false
    );

  v_score := case
    when v_total_questions = 0 then 0
    else round((v_correct_answers::numeric / v_total_questions::numeric) * 100)::int
  end;

  insert into public.test_attempts (test_id, user_id, score, correct_answers, total_questions, percentile)
  values (p_test_id, v_uid, v_score, v_correct_answers, v_total_questions, 0)
  returning * into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id, selected_answer, correct_answer, is_correct)
  select
    v_attempt.id,
    q.id,
    coalesce(p_answers ->> q.id::text, ''),
    case
      when q.question_type = 'integer' then coalesce(q.integer_answer::text, '')
      else coalesce(q.correct_answer, '')
    end,
    coalesce(
      case
        when q.question_type = 'mcq' then q.correct_answer = coalesce(p_answers ->> q.id::text, '')
        when q.question_type = 'integer' then q.integer_answer is not null and coalesce(p_answers ->> q.id::text, '') = q.integer_answer::text
        else false
      end,
      false
    )
  from public.test_questions q
  where q.test_id = p_test_id;

  v_leaderboard_batch_id := coalesce(v_test.batch_id, v_profile.batch_id);

  perform public.recalculate_test_attempt_percentiles(p_test_id, v_leaderboard_batch_id);

  select *
  into v_attempt
  from public.test_attempts a
  where a.id = v_attempt.id;

  perform public.refresh_admin_analytics();

  select jsonb_build_object(
    'id', aud.id,
    'full_name', aud.full_name,
    'email', aud.email,
    'role', aud.role,
    'approval_status', aud.approval_status,
    'batch_id', aud.batch_id,
    'target_exam', aud.target_exam,
    'class_label', aud.class_label,
    'avatar_seed', aud.avatar_seed,
    'rank', aud.rank,
    'average_score', aud.average_score,
    'streak_days', aud.streak_days
  )
  into v_user
  from public.admin_user_directory aud
  where aud.id = v_uid;

  if v_user is null then
    select jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'approval_status', p.approval_status,
      'batch_id', p.batch_id,
      'target_exam', p.target_exam,
      'class_label', p.class_label,
      'avatar_seed', p.avatar_seed,
      'rank', 0,
      'average_score', 0,
      'streak_days', 0
    )
    into v_user
    from public.profiles p
    where p.id = v_uid;
  end if;

  select jsonb_build_object(
    'id', tas.id,
    'test_id', tas.test_id,
    'user_id', tas.user_id,
    'score', tas.score,
    'correct_answers', tas.correct_answers,
    'total_questions', tas.total_questions,
    'rank', tas.rank,
    'percentile', tas.percentile,
    'submitted_at', tas.submitted_at
  )
  into v_result
  from public.test_attempt_summaries tas
  where tas.id = v_attempt.id;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', tl.user_id,
      'full_name', tl.full_name,
      'batch_id', tl.batch_id,
      'score', tl.score,
      'percentile', tl.percentile,
      'rank', tl.rank,
      'tests_attempted', tl.tests_attempted
    )
    order by tl.rank asc, tl.full_name asc
  )
  into v_leaderboard
  from public.get_leaderboard('test_wise', v_leaderboard_batch_id, p_test_id) tl;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', lb.user_id,
      'full_name', lb.full_name,
      'batch_id', lb.batch_id,
      'score', lb.score,
      'percentile', lb.percentile,
      'rank', lb.rank,
      'tests_attempted', lb.tests_attempted
    )
    order by lb.rank asc, lb.full_name asc
  )
  into v_overall_leaderboard
  from public.get_leaderboard('overall_history', v_profile.batch_id, null) lb;

  return jsonb_build_object(
    'result', v_result,
    'leaderboard', coalesce(v_leaderboard, '[]'::jsonb),
    'overall_leaderboard', coalesce(v_overall_leaderboard, '[]'::jsonb),
    'user', v_user
  );
end;
$$;

create or replace function public.delete_test_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.test_attempts;
  v_batch_id text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.test_attempts
  where id = p_attempt_id
  returning * into v_attempt;

  if v_attempt.id is null then
    raise exception 'Result not found';
  end if;

  select
    coalesce(t.batch_id, p.batch_id)
  into v_batch_id
  from public.tests t
  left join public.profiles p on p.id = v_attempt.user_id
  where t.id = v_attempt.test_id;

  perform public.recalculate_test_attempt_percentiles(v_attempt.test_id, v_batch_id);
  perform public.refresh_admin_analytics();

  return p_attempt_id;
end;
$$;

grant execute on function public.get_leaderboard(public.leaderboard_scope, text, uuid) to authenticated;
grant execute on function public.get_test_leaderboard(uuid) to authenticated;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated;
grant execute on function public.delete_test_attempt(uuid) to authenticated;
