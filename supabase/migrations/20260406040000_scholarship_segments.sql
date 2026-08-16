alter table if exists public.tests
  add column if not exists scholarship_admission_class text,
  add column if not exists scholarship_target_exam text;

alter table if exists public.tests
  drop constraint if exists tests_scholarship_admission_class_check;

alter table if exists public.tests
  add constraint tests_scholarship_admission_class_check
  check (
    scholarship_admission_class is null
    or scholarship_admission_class in ('8th', '9th', '10th', 'jee', 'neet')
  );

alter table if exists public.tests
  drop constraint if exists tests_scholarship_target_exam_check;

alter table if exists public.tests
  add constraint tests_scholarship_target_exam_check
  check (
    scholarship_target_exam is null
    or scholarship_target_exam in ('boards', 'jee', 'neet')
  );

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
  count(q.id)::int as question_count
from public.tests t
left join public.test_questions q on q.test_id = t.id
where t.is_published = true
group by t.id;

create or replace function public.create_test_with_questions(
  p_title text,
  p_description text,
  p_duration_minutes integer,
  p_batch_id text,
  p_type public.test_type,
  p_subject text,
  p_scholarship_admission_class text,
  p_scholarship_target_exam text,
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

  if p_type = 'scholarship' and (coalesce(trim(p_scholarship_admission_class), '') = '' or coalesce(trim(p_scholarship_target_exam), '') = '') then
    raise exception 'Scholarship tests require admission class and target exam';
  end if;

  insert into public.tests (
    title,
    description,
    duration_minutes,
    batch_id,
    type,
    subject,
    scheduled_at,
    created_by,
    scholarship_admission_class,
    scholarship_target_exam
  )
  values (
    p_title,
    p_description,
    p_duration_minutes,
    nullif(p_batch_id, ''),
    p_type,
    p_subject,
    timezone('utc', now()),
    auth.uid(),
    case when p_type = 'scholarship' then lower(trim(p_scholarship_admission_class)) else null end,
    case when p_type = 'scholarship' then lower(trim(p_scholarship_target_exam)) else null end
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_test
  from public.tests
  where id = p_test_id
    and type = 'scholarship'
    and is_published = true;

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

grant execute on function public.create_test_with_questions(text, text, integer, text, public.test_type, text, text, text, jsonb) to authenticated;
