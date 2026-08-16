create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'miitjee_student', 'admin');
create type public.approval_status as enum ('approved', 'pending');
create type public.test_type as enum ('weekly', 'scholarship');

create table if not exists public.batches (
  id text primary key,
  label text not null,
  target_exam text not null,
  class_label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.batches (id, label, target_exam, class_label)
values
  ('JEE_2026', 'JEE 2026', 'JEE Advanced', 'Class 12'),
  ('NEET_DROPPER', 'NEET Dropper', 'NEET', 'Dropper'),
  ('FOUNDATION_10', 'Foundation 10', 'Foundation', 'Class 10')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'student',
  approval_status public.approval_status not null default 'approved',
  batch_id text references public.batches (id),
  target_exam text not null default 'Scholarship',
  class_label text not null default 'General',
  avatar_seed text not null default 'miitjee',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  rating numeric(3,2) not null default 4.5,
  students integer not null default 0,
  price_label text not null,
  cover_color text not null default '#D1FAE5',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  batch_id text references public.batches (id),
  type public.test_type not null,
  subject text not null,
  scheduled_at timestamptz not null,
  is_published boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  position integer not null,
  prompt text not null,
  options jsonb not null,
  correct_answer text not null,
  explanation text not null,
  unique (test_id, position)
);

create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null default 0,
  correct_answers integer not null default 0,
  total_questions integer not null default 0,
  percentile integer not null default 0,
  submitted_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.test_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.test_attempts (id) on delete cascade,
  question_id uuid not null references public.test_questions (id) on delete cascade,
  selected_answer text not null,
  is_correct boolean not null
);

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete cascade,
  action text not null,
  window_bucket timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.app_role := case
    when new.raw_user_meta_data ->> 'requested_role' = 'admin' then 'admin'
    else 'student'
  end;
  requested_status public.approval_status := case
    when requested_role = 'admin' then 'pending'
    else 'approved'
  end;
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    approval_status,
    target_exam,
    class_label,
    avatar_seed
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'miitjee user'), '@', 1)),
    requested_role,
    requested_status,
    case when requested_role = 'admin' then 'Operations' else 'Scholarship' end,
    case when requested_role = 'admin' then 'Faculty' else 'Student' end,
    replace(lower(coalesce(new.raw_user_meta_data ->> 'full_name', coalesce(new.email, 'miitjee-user'))), ' ', '-')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and approval_status = 'approved'
  );
$$;

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
  count(q.id)::int as question_count
from public.tests t
left join public.test_questions q on q.test_id = t.id
where t.is_published = true
group by t.id;

create or replace view public.test_attempt_summaries
with (security_invoker = true) as
select
  a.id,
  a.test_id,
  a.user_id,
  a.score,
  a.correct_answers,
  a.total_questions,
  dense_rank() over (order by a.score desc, a.submitted_at asc)::int as rank,
  a.percentile,
  a.submitted_at
from public.test_attempts a;

create or replace view public.leaderboard_live
with (security_invoker = true) as
select
  ranked.user_id,
  p.full_name,
  p.batch_id,
  ranked.score,
  ranked.rank
from (
  select
    a.user_id,
    max(a.score)::int as score,
    dense_rank() over (order by max(a.score) desc)::int as rank
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
  coalesce(best.rank, 0) as rank,
  coalesce(avg_scores.average_score, 0) as average_score,
  coalesce(streaks.streak_days, 0) as streak_days
from public.profiles p
left join (
  select user_id, dense_rank() over (order by max(score) desc)::int as rank
  from public.test_attempts
  group by user_id
) best on best.user_id = p.id
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

create materialized view if not exists public.admin_analytics as
select
  (select count(*) from public.profiles)::int as total_users,
  (select count(*) from public.profiles where role in ('student', 'miitjee_student'))::int as total_students,
  (select count(*) from public.profiles where role = 'admin')::int as total_admins,
  (select count(*) from public.tests)::int as total_tests,
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
      prompt,
      options,
      correct_answer,
      explanation
    )
    values (
      v_test.id,
      v_index,
      v_question ->> 'prompt',
      coalesce(v_question -> 'options', '[]'::jsonb),
      (v_question -> 'options' ->> greatest(0, coalesce((v_question ->> 'correctOptionIndex')::int, 0))),
      coalesce(v_question ->> 'explanation', '')
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

create or replace function public.assign_batch_and_role(
  p_user_id uuid,
  p_batch_id text,
  p_promote_to_miitjee_student boolean default false
)
returns public.admin_user_directory
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set
    batch_id = nullif(p_batch_id, ''),
    role = case
      when role = 'admin' then role
      when p_promote_to_miitjee_student then 'miitjee_student'
      else 'student'
    end,
    target_exam = coalesce((select target_exam from public.batches where id = p_batch_id), target_exam),
    class_label = coalesce((select class_label from public.batches where id = p_batch_id), class_label)
  where id = p_user_id;

  return (
    select aud
    from public.admin_user_directory aud
    where aud.id = p_user_id
  );
end;
$$;

create or replace function public.approve_admin_user(p_user_id uuid)
returns public.admin_user_directory
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.profiles
  set approval_status = 'approved'
  where id = p_user_id
    and role = 'admin';

  perform public.refresh_admin_analytics();

  return (
    select aud
    from public.admin_user_directory aud
    where aud.id = p_user_id
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
  v_percentile integer := 0;
  v_attempt public.test_attempts;
  v_user public.admin_user_directory;
  v_result jsonb;
  v_leaderboard jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
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

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_attempt_answers enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses
for select using (auth.uid() is not null);

drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests
for select using (
  auth.uid() is not null
  and (
    type = 'scholarship'
    or public.is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.batch_id = tests.batch_id
    )
  )
);

drop policy if exists test_questions_read on public.test_questions;
create policy test_questions_read on public.test_questions
for select using (
  exists (
    select 1
    from public.tests t
    where t.id = test_questions.test_id
      and (
        t.type = 'scholarship'
        or public.is_admin()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.batch_id = t.batch_id
        )
      )
  )
);

drop policy if exists attempts_read on public.test_attempts;
create policy attempts_read on public.test_attempts
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists attempt_answers_read on public.test_attempt_answers;
create policy attempt_answers_read on public.test_attempt_answers
for select using (
  exists (
    select 1
    from public.test_attempts a
    where a.id = test_attempt_answers.attempt_id
      and (a.user_id = auth.uid() or public.is_admin())
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.courses, public.tests, public.test_questions, public.profiles to authenticated;
grant select on public.test_catalog, public.test_attempt_summaries, public.leaderboard_live, public.admin_user_directory to authenticated;
grant execute on function public.create_test_with_questions(text, text, integer, text, public.test_type, text, jsonb) to authenticated;
grant execute on function public.assign_batch_and_role(uuid, text, boolean) to authenticated;
grant execute on function public.approve_admin_user(uuid) to authenticated;
grant execute on function public.submit_test_attempt(uuid, jsonb) to authenticated;
grant execute on function public.refresh_admin_analytics() to authenticated;
grant execute on function public.get_admin_analytics() to authenticated;
