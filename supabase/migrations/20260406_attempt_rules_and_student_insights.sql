create index if not exists idx_test_attempts_test_id_user_id
  on public.test_attempts (test_id, user_id);

create or replace view public.test_attempt_summaries
with (security_invoker = true) as
select
  a.id,
  a.test_id,
  a.user_id,
  a.score,
  a.correct_answers,
  a.total_questions,
  dense_rank() over (
    partition by a.test_id
    order by a.percentile desc, a.score desc
  )::int as rank,
  a.percentile,
  a.submitted_at
from public.test_attempts a;

create or replace function public.get_test_leaderboard(p_test_id uuid)
returns table (
  user_id uuid,
  full_name text,
  batch_id text,
  score integer,
  percentile integer,
  rank integer
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      a.user_id,
      max(a.score)::int as score,
      max(a.percentile)::int as percentile,
      dense_rank() over (
        order by max(a.percentile) desc, max(a.score) desc
      )::int as rank
    from public.test_attempts a
    where a.test_id = p_test_id
    group by a.user_id
  )
  select
    ranked.user_id,
    p.full_name,
    p.batch_id,
    ranked.score,
    ranked.percentile,
    ranked.rank
  from ranked
  join public.profiles p on p.id = ranked.user_id
  order by ranked.rank asc, p.full_name asc;
$$;

create or replace view public.leaderboard_live
with (security_invoker = true) as
select
  ranked.user_id,
  p.full_name,
  p.batch_id,
  ranked.score,
  ranked.rank,
  ranked.percentile,
  ranked.tests_attempted
from (
  select
    a.user_id,
    round(avg(a.score))::int as score,
    round(avg(a.percentile))::int as percentile,
    count(*)::int as tests_attempted,
    dense_rank() over (
      order by avg(a.percentile) desc, avg(a.score) desc, count(*) desc
    )::int as rank
  from public.test_attempts a
  group by a.user_id
) ranked
join public.profiles p on p.id = ranked.user_id
order by ranked.rank asc, p.full_name asc;

create or replace view public.admin_user_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.approval_status,
  p.batch_id,
  p.target_exam,
  p.class_label,
  p.avatar_seed,
  coalesce(lb.rank, 0) as rank,
  coalesce(avg_scores.average_score, 0) as average_score,
  coalesce(streaks.streak_days, 0) as streak_days
from public.profiles p
left join public.leaderboard_live lb on lb.user_id = p.id
left join (
  select user_id, round(avg(score))::int as average_score
  from public.test_attempts
  group by user_id
) avg_scores on avg_scores.user_id = p.id
left join (
  select user_id, count(*)::int as streak_days
  from public.test_attempts
  where submitted_at >= timezone('utc', now()) - interval '30 day'
  group by user_id
) streaks on streaks.user_id = p.id;

create or replace view public.student_analytics
with (security_invoker = true) as
select
  p.id as user_id,
  p.full_name,
  count(a.id)::int as tests_attempted,
  coalesce(round(avg(a.score)), 0)::int as avg_score,
  coalesce(max(a.score), 0)::int as best_score,
  coalesce(round(avg(a.percentile)), 0)::int as avg_percentile
from public.profiles p
left join public.test_attempts a on a.user_id = p.id
group by p.id, p.full_name;

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
  v_percentile integer := 100;
  v_attempt public.test_attempts;
  v_user public.admin_user_directory;
  v_result jsonb;
  v_leaderboard jsonb;
  v_profile public.profiles;
  v_test public.tests;
  v_total_students integer := 0;
  v_below_count integer := 0;
  v_equal_count integer := 0;
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

  select * into v_profile
  from public.profiles
  where id = v_uid;

  select * into v_test
  from public.tests
  where id = p_test_id
    and is_published = true;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if v_test.type = 'weekly' and not public.is_admin() then
    if not (
      v_profile.role = 'miitjee_student'
      and v_profile.batch_id = v_test.batch_id
    ) then
      raise exception 'Weekly tests are only for MIITJEE students of the matching batch';
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

  select count(*)::int into v_total_questions
  from public.test_questions
  where test_id = p_test_id;

  select count(*)::int into v_correct_answers
  from public.test_questions q
  where q.test_id = p_test_id
    and (
      (q.question_type = 'mcq' and q.correct_answer = coalesce(p_answers ->> q.id::text, ''))
      or
      (q.question_type = 'integer' and q.integer_answer is not null and (p_answers ->> q.id::text) = q.integer_answer::text)
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
    case when q.question_type = 'integer' then coalesce(q.integer_answer::text, '') else q.correct_answer end,
    case
      when q.question_type = 'mcq' then q.correct_answer = coalesce(p_answers ->> q.id::text, '')
      when q.question_type = 'integer' then q.integer_answer is not null and (p_answers ->> q.id::text) = q.integer_answer::text
      else false
    end
  from public.test_questions q
  where q.test_id = p_test_id;

  select count(*)::int into v_total_students
  from public.test_attempts
  where test_id = p_test_id;

  if v_total_students <= 1 then
    v_percentile := 100;
  else
    select count(*)::int into v_below_count
    from public.test_attempts
    where test_id = p_test_id
      and score < v_score;

    select count(*)::int into v_equal_count
    from public.test_attempts
    where test_id = p_test_id
      and score = v_score;

    v_percentile := round(((v_below_count + 0.5 * v_equal_count) / v_total_students::numeric) * 100)::int;
  end if;

  update public.test_attempts
  set percentile = v_percentile
  where id = v_attempt.id
  returning * into v_attempt;

  perform public.refresh_admin_analytics();

  select aud into v_user
  from public.admin_user_directory aud
  where aud.id = v_uid;

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

  select jsonb_agg(jsonb_build_object(
    'user_id', tl.user_id,
    'full_name', tl.full_name,
    'batch_id', tl.batch_id,
    'score', tl.score,
    'percentile', tl.percentile,
    'rank', tl.rank
  ))
  into v_leaderboard
  from public.get_test_leaderboard(p_test_id) tl;

  return jsonb_build_object(
    'result', v_result,
    'leaderboard', coalesce(v_leaderboard, '[]'::jsonb),
    'user', to_jsonb(v_user)
  );
end;
$$;

create or replace function public.get_student_insights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  return jsonb_build_object(
    'summary',
    (
      with ordered_attempts as (
        select
          a.score,
          a.percentile,
          a.submitted_at
        from public.test_attempts a
        where a.user_id = v_uid
        order by a.submitted_at asc
      )
      select to_jsonb(summary_row)
      from (
        select
          count(*)::int as tests_attempted,
          coalesce(round(avg(score)), 0)::int as avg_score,
          coalesce(round(avg(percentile)), 0)::int as avg_percentile,
          coalesce(max(score), 0)::int as best_score,
          coalesce(max(percentile), 0)::int as best_percentile,
          coalesce((array_agg(score order by submitted_at desc))[1], 0)::int as latest_score,
          coalesce((array_agg(percentile order by submitted_at desc))[1], 0)::int as latest_percentile,
          case
            when count(*) <= 1 then 0
            else coalesce((array_agg(score order by submitted_at desc))[1], 0)::int
              - coalesce((array_agg(score order by submitted_at asc))[1], 0)::int
          end as improvement_score
        from ordered_attempts
      ) summary_row
    ),
    'history',
    coalesce(
      (
        select jsonb_agg(to_jsonb(history_row) order by history_row.submitted_at desc)
        from (
          select
            tas.id as attempt_id,
            tas.test_id,
            t.title as test_title,
            t.subject,
            tas.score,
            tas.percentile,
            tas.rank,
            tas.submitted_at
          from public.test_attempt_summaries tas
          join public.tests t on t.id = tas.test_id
          where tas.user_id = v_uid
          order by tas.submitted_at desc
        ) history_row
      ),
      '[]'::jsonb
    ),
    'subject_breakdown',
    coalesce(
      (
        with subject_rollup as (
          select
            t.subject,
            count(*)::int as attempts,
            round(avg(a.score))::int as avg_score,
            round(avg(a.percentile))::int as avg_percentile
          from public.test_attempts a
          join public.tests t on t.id = a.test_id
          where a.user_id = v_uid
          group by t.subject
        ),
        latest_subject as (
          select distinct on (t.subject)
            t.subject,
            a.score as latest_score,
            a.percentile as latest_percentile
          from public.test_attempts a
          join public.tests t on t.id = a.test_id
          where a.user_id = v_uid
          order by t.subject, a.submitted_at desc
        )
        select jsonb_agg(to_jsonb(subject_row) order by subject_row.avg_percentile asc, subject_row.subject asc)
        from (
          select
            sr.subject,
            sr.attempts,
            sr.avg_score,
            sr.avg_percentile,
            coalesce(ls.latest_score, 0)::int as latest_score,
            coalesce(ls.latest_percentile, 0)::int as latest_percentile
          from subject_rollup sr
          left join latest_subject ls on ls.subject = sr.subject
        ) subject_row
      ),
      '[]'::jsonb
    ),
    'weak_areas',
    coalesce(
      (
        with subject_rollup as (
          select
            t.subject,
            count(*)::int as attempts,
            round(avg(a.score))::int as avg_score,
            round(avg(a.percentile))::int as avg_percentile
          from public.test_attempts a
          join public.tests t on t.id = a.test_id
          where a.user_id = v_uid
          group by t.subject
        ),
        latest_subject as (
          select distinct on (t.subject)
            t.subject,
            a.score as latest_score,
            a.percentile as latest_percentile
          from public.test_attempts a
          join public.tests t on t.id = a.test_id
          where a.user_id = v_uid
          order by t.subject, a.submitted_at desc
        )
        select jsonb_agg(to_jsonb(weak_row) order by weak_row.avg_percentile asc, weak_row.avg_score asc, weak_row.subject asc)
        from (
          select
            sr.subject,
            sr.attempts,
            sr.avg_score,
            sr.avg_percentile,
            coalesce(ls.latest_score, 0)::int as latest_score,
            coalesce(ls.latest_percentile, 0)::int as latest_percentile
          from subject_rollup sr
          left join latest_subject ls on ls.subject = sr.subject
          order by sr.avg_percentile asc, sr.avg_score asc, sr.subject asc
          limit 3
        ) weak_row
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant select on public.test_attempt_summaries, public.leaderboard_live, public.student_analytics to authenticated;
grant execute on function public.get_test_leaderboard(uuid) to authenticated;
grant execute on function public.get_student_insights() to authenticated;
