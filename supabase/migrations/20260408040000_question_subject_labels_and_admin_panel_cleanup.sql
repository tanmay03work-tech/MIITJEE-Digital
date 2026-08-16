alter table public.test_questions
add column if not exists subject_label text;

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
    and t.is_published = true;

  if v_test.id is null then
    raise exception 'Test not found';
  end if;

  if not (
    public.is_admin()
    or v_test.type = 'scholarship'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.batch_id is not null
        and p.batch_id = v_test.batch_id
    )
  ) then
    raise exception 'You are not eligible to view this test';
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

create or replace function public.create_test_with_questions(
  p_title text,
  p_description text,
  p_duration_minutes integer,
  p_batch_id text,
  p_type public.test_type,
  p_subject text,
  p_scholarship_admission_class text,
  p_scholarship_target_exam text,
  p_questions jsonb,
  p_scheduled_at timestamptz default null
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

  if p_type = 'weekly' and coalesce(trim(p_batch_id), '') = '' then
    raise exception 'Weekly tests require a batch';
  end if;

  if p_type = 'scholarship' and (
    coalesce(trim(p_scholarship_admission_class), '') = ''
    or coalesce(trim(p_scholarship_target_exam), '') = ''
  ) then
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
    scholarship_target_exam,
    is_started,
    started_at
  )
  values (
    p_title,
    p_description,
    p_duration_minutes,
    case when p_type = 'weekly' then nullif(p_batch_id, '') else null end,
    p_type,
    p_subject,
    coalesce(p_scheduled_at, timezone('utc', now())),
    auth.uid(),
    case when p_type = 'scholarship' then lower(trim(p_scholarship_admission_class)) else null end,
    case when p_type = 'scholarship' then lower(trim(p_scholarship_target_exam)) else null end,
    false,
    null
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
      image_url,
      subject_label
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
        when coalesce(v_question ->> 'type', 'mcq') = 'mcq'
          then coalesce(
            v_question -> 'options' ->> greatest(0, coalesce((v_question ->> 'correctOptionIndex')::int, 0)),
            ''
          )
        else ''
      end,
      case
        when coalesce(v_question ->> 'type', 'mcq') = 'integer'
          then nullif(v_question ->> 'integerAnswer', '')::integer
        else null
      end,
      coalesce(v_question ->> 'explanation', ''),
      nullif(v_question ->> 'imageUrl', ''),
      nullif(trim(coalesce(v_question ->> 'subjectLabel', '')), '')
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

grant execute on function public.list_test_questions(uuid) to authenticated;
grant execute on function public.create_test_with_questions(text, text, integer, text, public.test_type, text, text, text, jsonb, timestamptz) to authenticated;
