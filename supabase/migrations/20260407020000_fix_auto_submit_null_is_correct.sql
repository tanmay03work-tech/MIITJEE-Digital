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
