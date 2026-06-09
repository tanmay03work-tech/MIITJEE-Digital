alter table public.tests
add column if not exists deleted_at timestamptz;

create index if not exists idx_tests_deleted_at on public.tests (deleted_at);

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
  count(q.id)::int as question_count,
  t.is_started,
  t.started_at
from public.tests t
left join public.test_questions q on q.test_id = t.id
where t.is_published = true
  and t.deleted_at is null
group by t.id;

drop policy if exists test_questions_read on public.test_questions;
create policy test_questions_read on public.test_questions
for select using (
  exists (
    select 1
    from public.tests t
    where t.id = test_questions.test_id
      and t.is_published = true
      and t.deleted_at is null
      and (
        public.is_admin()
        or (
          t.is_started = true
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
  image_url text,
  subject_label text
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
    and t.is_published = true
    and t.deleted_at is null;

  if v_test.id is null then
    raise exception 'Test not found';
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

create or replace function public.delete_test(p_test_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.tests
  set
    is_published = false,
    deleted_at = timezone('utc', now())
  where id = p_test_id
    and deleted_at is null;

  if not found then
    raise exception 'Test not found';
  end if;

  perform public.refresh_admin_analytics();

  return p_test_id;
end;
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

  refresh materialized view public.admin_analytics;

  return (
    select
      row(
        (select count(*) from public.profiles)::int,
        (select count(*) from public.profiles where role in ('student', 'miitjee_student'))::int,
        (select count(*) from public.profiles where role = 'admin')::int,
        (select count(*) from public.tests where deleted_at is null)::int,
        (select count(*) from public.test_questions q join public.tests t on t.id = q.test_id where t.deleted_at is null)::int,
        (select count(*) from public.test_attempts)::int,
        coalesce((select round(avg(score))::int from public.test_attempts), 0)::int,
        (select count(*) from public.test_attempts where submitted_at >= timezone('utc', now()) - interval '24 hour')::int,
        (
          select count(distinct user_id)
          from public.test_attempts
          where submitted_at >= timezone('utc', now()) - interval '7 day'
        )::int
      )::public.admin_analytics
  );
end;
$$;

grant execute on function public.list_available_tests() to authenticated;
grant execute on function public.list_test_questions(uuid) to authenticated;
grant execute on function public.delete_test(uuid) to authenticated;
grant execute on function public.get_admin_analytics() to authenticated;
