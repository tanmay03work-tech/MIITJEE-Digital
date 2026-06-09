alter table if exists public.rate_limit_events
  add column if not exists test_id uuid references public.tests(id) on delete cascade;

create index if not exists idx_rate_limit_events_test_created_at
  on public.rate_limit_events (test_id, created_at desc);

create index if not exists idx_rate_limit_events_auto_submit
  on public.rate_limit_events (action, created_at desc)
  where action = 'auto_submit';

create or replace function public.is_test_live(
  p_is_started boolean,
  p_scheduled_at timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_is_started, false)
    or (
      p_scheduled_at is not null
      and p_scheduled_at <= timezone('utc', now())
    );
$$;

create or replace function public.get_effective_test_start_at(
  p_is_started boolean,
  p_started_at timestamptz,
  p_scheduled_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(p_is_started, false) then coalesce(p_started_at, p_scheduled_at)
    when p_scheduled_at is not null and p_scheduled_at <= timezone('utc', now()) then p_scheduled_at
    else null
  end;
$$;

drop policy if exists rate_limit_events_self_insert on public.rate_limit_events;
create policy rate_limit_events_self_insert on public.rate_limit_events
for insert
with check (
  actor_id = auth.uid()
  and test_id is not null
  and action in ('app_background', 'app_inactive', 'auto_submit')
);

create or replace view public.admin_auto_submit_events
with (security_invoker = true) as
select
  r.id as event_id,
  p.id as user_id,
  p.full_name,
  p.email,
  p.batch_id,
  t.id as test_id,
  t.title as test_title,
  r.created_at as auto_submitted_at
from public.rate_limit_events r
join public.profiles p on p.id = r.actor_id
join public.tests t on t.id = r.test_id
where r.action = 'auto_submit';

create or replace view public.test_catalog
with (security_invoker = true) as
select
  t.id,
  t.title,
  t.description,
  t.duration_minutes,
  t.batch_id,
  t.type,
  t.subject,
  t.scheduled_at,
  t.is_published,
  t.scholarship_admission_class,
  t.scholarship_target_exam,
  qc.question_count,
  public.is_test_live(t.is_started, t.scheduled_at) as is_started,
  public.get_effective_test_start_at(t.is_started, t.started_at, t.scheduled_at) as started_at
from public.tests t
left join lateral (
  select count(*)::int as question_count
  from public.test_questions q
  where q.test_id = t.id
) qc on true
where t.is_published = true;

drop policy if exists test_questions_read on public.test_questions;
create policy test_questions_read on public.test_questions
for select using (
  exists (
    select 1
    from public.tests t
    where t.id = test_questions.test_id
      and t.is_published = true
      and (
        public.is_admin()
        or (
          public.is_test_live(t.is_started, t.scheduled_at)
          and (
            t.type = 'scholarship'
            or exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and p.batch_id is not null
                and p.batch_id = t.batch_id
            )
          )
        )
      )
  )
);

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
    public.is_test_live(t.is_started, t.scheduled_at) as is_started,
    public.get_effective_test_start_at(t.is_started, t.started_at, t.scheduled_at) as started_at,
    t.scholarship_admission_class,
    t.scholarship_target_exam
  from public.tests t
  left join lateral (
    select count(*)::int as question_count
    from public.test_questions q
    where q.test_id = t.id
  ) qc on true
  where t.is_published = true
    and (
      public.is_admin()
      or t.type = 'scholarship'
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
  image_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test public.tests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_test
  from public.tests t
  where t.id = p_test_id
    and t.is_published = true;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if not public.is_admin() then
    if not public.is_test_live(v_test.is_started, v_test.scheduled_at) then
      raise exception 'This test will start at the scheduled time. Have patience.';
    end if;

    if v_test.type = 'weekly' and not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.batch_id is not null
        and p.batch_id = v_test.batch_id
    ) then
      raise exception 'Weekly tests are only for students of the matching batch';
    end if;
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
    q.image_url
  from public.test_questions q
  where q.test_id = p_test_id
  order by q.position asc;
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
  v_percentile integer := 100;
  v_attempt public.test_attempts;
  v_user jsonb;
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

  if not public.is_admin() and not public.is_test_live(v_test.is_started, v_test.scheduled_at) then
    raise exception 'This test will start at the scheduled time. Have patience.';
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

  select count(*)::int
  into v_total_students
  from public.test_attempts
  where test_id = p_test_id;

  if v_total_students <= 1 then
    v_percentile := 100;
  else
    select count(*)::int
    into v_below_count
    from public.test_attempts
    where test_id = p_test_id
      and score < v_score;

    select count(*)::int
    into v_equal_count
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
      'rank', tl.rank
    )
  )
  into v_leaderboard
  from public.get_test_leaderboard(p_test_id) tl;

  return jsonb_build_object(
    'result', v_result,
    'leaderboard', coalesce(v_leaderboard, '[]'::jsonb),
    'user', v_user
  );
end;
$$;

grant select on public.admin_auto_submit_events to authenticated;
grant execute on function public.is_test_live(boolean, timestamptz) to authenticated;
grant execute on function public.get_effective_test_start_at(boolean, timestamptz, timestamptz) to authenticated;
