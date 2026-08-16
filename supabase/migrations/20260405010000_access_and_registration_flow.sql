create table if not exists public.enrollment_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  batch_id text not null references public.batches (id),
  phone text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scholarship_registrations (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  class_label text not null,
  target_exam text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (test_id, user_id)
);

alter table public.enrollment_queries enable row level security;
alter table public.scholarship_registrations enable row level security;

drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests
for select using (auth.uid() is not null);

drop policy if exists test_questions_read on public.test_questions;
create policy test_questions_read on public.test_questions
for select using (
  exists (
    select 1
    from public.tests t
    join public.profiles p on p.id = auth.uid()
    where t.id = test_questions.test_id
      and (
        t.type = 'scholarship'
        or public.is_admin()
        or (
          p.role = 'miitjee_student'
          and p.batch_id = t.batch_id
        )
      )
  )
);

drop policy if exists enrollment_queries_self_read on public.enrollment_queries;
create policy enrollment_queries_self_read on public.enrollment_queries
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists scholarship_registrations_self_read on public.scholarship_registrations;
create policy scholarship_registrations_self_read on public.scholarship_registrations
for select using (user_id = auth.uid() or public.is_admin());

create or replace view public.admin_enrollment_queries
with (security_invoker = true) as
select
  eq.id,
  eq.user_id,
  p.full_name,
  p.email,
  eq.batch_id,
  b.label as batch_label,
  eq.phone,
  eq.message,
  eq.status,
  eq.created_at
from public.enrollment_queries eq
join public.profiles p on p.id = eq.user_id
join public.batches b on b.id = eq.batch_id;

create or replace view public.admin_scholarship_registrations
with (security_invoker = true) as
select
  sr.id,
  sr.test_id,
  t.title as test_title,
  sr.user_id,
  sr.full_name,
  sr.email,
  sr.phone,
  sr.city,
  sr.class_label,
  sr.target_exam,
  sr.created_at
from public.scholarship_registrations sr
join public.tests t on t.id = sr.test_id;

create or replace function public.submit_enrollment_query(
  p_batch_id text,
  p_phone text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.enrollment_queries (user_id, batch_id, phone, message)
  values (auth.uid(), p_batch_id, p_phone, p_message);
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.tests
    where id = p_test_id
      and type = 'scholarship'
      and is_published = true
  ) then
    raise exception 'Scholarship test not found';
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
    p_class_label,
    p_target_exam
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
  v_percentile integer := 0;
  v_attempt public.test_attempts;
  v_user public.admin_user_directory;
  v_result jsonb;
  v_leaderboard jsonb;
  v_profile public.profiles;
  v_test public.tests;
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
    and q.correct_answer = coalesce(p_answers ->> q.id::text, '');

  v_score := case when v_total_questions = 0 then 0 else round((v_correct_answers::numeric / v_total_questions::numeric) * 100)::int end;
  v_percentile := least(99, greatest(35, v_score + 8));

  insert into public.test_attempts (test_id, user_id, score, correct_answers, total_questions, percentile)
  values (p_test_id, v_uid, v_score, v_correct_answers, v_total_questions, v_percentile)
  returning * into v_attempt;

  insert into public.test_attempt_answers (attempt_id, question_id, selected_answer, is_correct)
  select
    v_attempt.id,
    q.id,
    coalesce(p_answers ->> q.id::text, ''),
    q.correct_answer = coalesce(p_answers ->> q.id::text, '')
  from public.test_questions q
  where q.test_id = p_test_id;

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

grant execute on function public.submit_enrollment_query(text, text, text) to authenticated;
grant execute on function public.upsert_scholarship_registration(uuid, text, text, text, text, text, text) to authenticated;
grant select on public.admin_enrollment_queries, public.admin_scholarship_registrations to authenticated;
