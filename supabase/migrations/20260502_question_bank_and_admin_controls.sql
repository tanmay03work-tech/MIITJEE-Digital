create table if not exists public.question_sets (
  set_id bigint primary key,
  pdf_name text not null,
  question_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_question_sets_created_at on public.question_sets (created_at desc);

alter table public.question_sets enable row level security;

drop policy if exists question_sets_read_all on public.question_sets;
create policy question_sets_read_all on public.question_sets
for select
using (true);

drop policy if exists question_sets_insert_authenticated on public.question_sets;
create policy question_sets_insert_authenticated on public.question_sets
for insert to authenticated
with check (true);

create or replace function public.wipe_leaderboard()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  delete from public.test_attempt_answers;
  delete from public.test_attempts;

  perform public.refresh_admin_analytics();

  return 'leaderboard_wiped';
end;
$$;

create or replace function public.list_available_tests()
returns table (
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  question_count integer,
  batch_id text,
  type public.test_type,
  subject text,
  scheduled_at timestamptz,
  is_published boolean,
  is_started boolean,
  started_at timestamptz,
  scholarship_admission_class text,
  scholarship_target_exam text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.description,
    t.duration_minutes,
    qc.question_count,
    t.batch_id,
    t.type,
    t.subject,
    t.scheduled_at,
    t.is_published,
    t.is_started,
    t.started_at,
    t.scholarship_admission_class,
    t.scholarship_target_exam
  from public.tests t
  left join lateral (
    select count(*)::int as question_count
    from public.test_questions q
    where q.test_id = t.id
  ) qc on true
  where t.is_published = true
    and t.deleted_at is null
    and (
      public.is_admin()
      or (
        t.type = 'scholarship'
        and coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'student') <> 'miitjee_student'
      )
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.batch_id is not null
          and p.batch_id = t.batch_id
      )
    )
  order by t.scheduled_at asc;
$$;

create or replace function public.list_test_questions(p_test_id uuid)
returns table (
  id uuid,
  test_id uuid,
  question_type text,
  prompt text,
  options jsonb,
  correct_answer text,
  integer_answer integer,
  explanation text,
  image_url text,
  subject_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test public.tests;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid();

  select *
  into v_test
  from public.tests t
  where t.id = p_test_id
    and t.is_published = true
    and t.deleted_at is null;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if v_test.type = 'scholarship' and not public.is_admin() and v_profile.role = 'miitjee_student' then
    raise exception 'MIITJEE students cannot open scholarship tests';
  end if;

  if not (
    public.is_admin()
    or (
      v_test.is_started = true
      and (
        v_test.type = 'scholarship'
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.batch_id is not null
            and p.batch_id = v_test.batch_id
        )
      )
    )
  ) then
    raise exception 'This test is locked until an admin starts it.';
  end if;

  return query
  select
    q.id,
    q.test_id,
    q.question_type::text,
    q.prompt,
    q.options,
    q.correct_answer,
    q.integer_answer,
    q.explanation,
    q.image_url,
    q.subject_label
  from public.test_questions q
  where q.test_id = p_test_id
  order by q.position asc;
end;
$$;

create or replace function public.upsert_scholarship_registration(
  p_test_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_city text,
  p_class_label text,
  p_target_exam text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test public.tests;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.role = 'miitjee_student' then
    raise exception 'MIITJEE students cannot register for scholarship tests';
  end if;

  select * into v_test
  from public.tests
  where id = p_test_id
    and type = 'scholarship'
    and is_published = true
    and deleted_at is null;

  if v_test.id is null then
    raise exception 'Scholarship test not found';
  end if;

  if v_test.scholarship_admission_class is not null and lower(trim(p_class_label)) <> v_test.scholarship_admission_class then
    raise exception 'Selected admission class does not match this scholarship paper';
  end if;

  if v_test.scholarship_target_exam is not null and lower(trim(p_target_exam)) <> v_test.scholarship_target_exam then
    raise exception 'Selected target exam does not match this scholarship paper';
  end if;

  insert into public.scholarship_registrations (
    test_id,
    user_id,
    full_name,
    email,
    phone,
    city,
    class_label,
    target_exam
  )
  values (
    p_test_id,
    auth.uid(),
    p_full_name,
    p_email,
    p_phone,
    p_city,
    lower(trim(p_class_label)),
    lower(trim(p_target_exam))
  )
  on conflict (test_id, user_id)
  do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    city = excluded.city,
    class_label = excluded.class_label,
    target_exam = excluded.target_exam;
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
  v_now timestamptz := timezone('utc', now());
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
    and is_published = true
    and deleted_at is null;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if not public.is_admin()
    and not (
      coalesce(v_test.is_started, false)
      or coalesce(v_test.started_at, v_test.scheduled_at, v_now) <= v_now
    ) then
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
    if not public.is_admin() and v_profile.role = 'miitjee_student' then
      raise exception 'MIITJEE students cannot attempt scholarship tests';
    end if;

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

grant execute on function public.wipe_leaderboard() to authenticated;
