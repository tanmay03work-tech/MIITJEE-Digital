alter table if exists public.test_questions
  add column if not exists question_type text not null default 'mcq',
  add column if not exists image_url text,
  add column if not exists integer_answer integer;

alter table if exists public.test_attempt_answers
  add column if not exists correct_answer text,
  add column if not exists is_correct boolean not null default false;

create table if not exists public.pdf_import_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  pdf_url text not null,
  source_provider text not null default 'ocr_space',
  model_provider text not null default 'openai',
  status text not null default 'queued',
  extracted_text_preview text,
  parsed_questions jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_test_questions_test_id_position on public.test_questions (test_id, position);
create index if not exists idx_test_attempts_test_id_score on public.test_attempts (test_id, score desc);
create index if not exists idx_test_attempts_user_id_submitted_at on public.test_attempts (user_id, submitted_at desc);
create index if not exists idx_test_attempt_answers_attempt_id on public.test_attempt_answers (attempt_id);
create index if not exists idx_pdf_import_jobs_requested_by on public.pdf_import_jobs (requested_by, created_at desc);

alter table public.pdf_import_jobs enable row level security;

drop policy if exists pdf_import_jobs_admin_only on public.pdf_import_jobs;
create policy pdf_import_jobs_admin_only on public.pdf_import_jobs
for select using (public.is_admin());

create or replace view public.question_analytics
with (security_invoker = true) as
select
  q.id as question_id,
  q.prompt,
  count(taa.id)::int as total_attempts,
  count(*) filter (where taa.is_correct)::int as correct_count,
  coalesce(round((count(*) filter (where taa.is_correct)::numeric / nullif(count(taa.id), 0)::numeric) * 100), 0)::int as accuracy_percent
from public.test_questions q
left join public.test_attempt_answers taa on taa.question_id = q.id
group by q.id, q.prompt;

create or replace view public.test_analytics
with (security_invoker = true) as
select
  t.id as test_id,
  t.title,
  count(a.id)::int as attempts,
  coalesce(round(avg(a.score)), 0)::int as avg_score,
  coalesce(max(a.score), 0)::int as highest_score
from public.tests t
left join public.test_attempts a on a.test_id = t.id
group by t.id, t.title;

create or replace view public.student_analytics
with (security_invoker = true) as
select
  p.id as user_id,
  p.full_name,
  count(a.id)::int as tests_attempted,
  coalesce(round(avg(a.score)), 0)::int as avg_score,
  coalesce(max(a.score), 0)::int as best_score
from public.profiles p
left join public.test_attempts a on a.user_id = p.id
group by p.id, p.full_name;

drop function if exists public.get_admin_analytics();
drop materialized view if exists public.admin_analytics;
create materialized view public.admin_analytics as
select
  (select count(*) from public.profiles)::int as total_users,
  (select count(*) from public.profiles where role in ('student', 'miitjee_student'))::int as total_students,
  (select count(*) from public.profiles where role = 'admin')::int as total_admins,
  (select count(*) from public.tests)::int as total_tests,
  (select count(*) from public.test_questions)::int as total_questions,
  (select count(*) from public.test_attempts)::int as total_attempts,
  coalesce((select round(avg(score))::int from public.test_attempts), 0)::int as avg_score,
  (select count(*) from public.test_attempts where submitted_at >= timezone('utc', now()) - interval '24 hour')::int as attempts_last_24h,
  (
    select count(distinct user_id)
    from public.test_attempts
    where submitted_at >= timezone('utc', now()) - interval '7 day'
  )::int as active_students_last_7d;

create unique index if not exists admin_analytics_one_row on public.admin_analytics ((1));

create or replace function public.refresh_admin_analytics()
returns void
language sql
security definer
as $$
  refresh materialized view public.admin_analytics;
$$;

create or replace function public.get_admin_analytics()
returns public.admin_analytics
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return (select aa from public.admin_analytics aa limit 1);
end;
$$;

create or replace function public.create_test_with_questions(
  p_title text,
  p_description text,
  p_duration_minutes integer,
  p_batch_id text,
  p_type public.test_type,
  p_subject text,
  p_questions jsonb
)
returns public.test_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test public.tests;
  v_question jsonb;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  insert into public.tests (
    title,
    description,
    duration_minutes,
    batch_id,
    type,
    subject,
    scheduled_at,
    created_by
  )
  values (
    p_title,
    p_description,
    p_duration_minutes,
    nullif(p_batch_id, ''),
    p_type,
    p_subject,
    timezone('utc', now()),
    auth.uid()
  )
  returning * into v_test;

  for v_question in select * from jsonb_array_elements(p_questions)
  loop
    v_index := v_index + 1;
    insert into public.test_questions (
      test_id,
      position,
      question_type,
      prompt,
      options,
      correct_answer,
      integer_answer,
      explanation,
      image_url
    )
    values (
      v_test.id,
      v_index,
      coalesce(v_question ->> 'type', 'mcq'),
      v_question ->> 'prompt',
      case
        when coalesce(v_question ->> 'type', 'mcq') = 'mcq' then coalesce(v_question -> 'options', '[]'::jsonb)
        else '[]'::jsonb
      end,
      case
        when coalesce(v_question ->> 'type', 'mcq') = 'integer'
          then coalesce(v_question ->> 'integerAnswer', '')
        else (v_question -> 'options' ->> greatest(0, coalesce((v_question ->> 'correctOptionIndex')::int, 0)))
      end,
      case
        when coalesce(v_question ->> 'type', 'mcq') = 'integer'
          then nullif(v_question ->> 'integerAnswer', '')::integer
        else null
      end,
      coalesce(v_question ->> 'explanation', ''),
      nullif(v_question ->> 'imageUrl', '')
    );
  end loop;

  perform public.refresh_admin_analytics();

  return (
    select tc
    from public.test_catalog tc
    where tc.id = v_test.id
  );
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

  v_score := case when v_total_questions = 0 then 0 else round((v_correct_answers::numeric / v_total_questions::numeric) * 100)::int end;

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
    'user_id', ll.user_id,
    'full_name', ll.full_name,
    'batch_id', ll.batch_id,
    'score', ll.score,
    'rank', ll.rank
  ))
  into v_leaderboard
  from public.leaderboard_live ll;

  return jsonb_build_object(
    'result', v_result,
    'leaderboard', coalesce(v_leaderboard, '[]'::jsonb),
    'user', to_jsonb(v_user)
  );
end;
$$;

create or replace function public.review_answers(p_attempt_id uuid)
returns table (
  question_id uuid,
  test_id uuid,
  question_type text,
  prompt text,
  options text[],
  user_answer text,
  correct_answer text,
  is_correct boolean,
  explanation text,
  image_url text
)
language sql
security definer
set search_path = public
as $$
  select
    q.id as question_id,
    q.test_id,
    q.question_type,
    q.prompt,
    coalesce(array(select jsonb_array_elements_text(q.options)), array[]::text[]) as options,
    taa.selected_answer as user_answer,
    taa.correct_answer,
    taa.is_correct,
    q.explanation,
    q.image_url
  from public.test_attempt_answers taa
  join public.test_attempts ta on ta.id = taa.attempt_id
  join public.test_questions q on q.id = taa.question_id
  where taa.attempt_id = p_attempt_id
    and (ta.user_id = auth.uid() or public.is_admin())
  order by q.position asc;
$$;

grant select on public.question_analytics, public.test_analytics, public.student_analytics to authenticated;
grant execute on function public.review_answers(uuid) to authenticated;
grant execute on function public.get_admin_analytics() to authenticated;
