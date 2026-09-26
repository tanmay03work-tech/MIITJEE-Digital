-- Migration: Support is_open_for_all and optional batch in create_test_with_questions
-- Date: 2026-09-13

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
  p_scheduled_at timestamptz default null,
  p_is_open_for_all boolean default false
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

  if p_type = 'weekly' and coalesce(p_is_open_for_all, false) = false and coalesce(trim(p_batch_id), '') = '' then
    raise exception 'Weekly restricted tests require a batch';
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
    started_at,
    is_open_for_all
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
    null,
    coalesce(p_is_open_for_all, false)
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

grant execute on function public.create_test_with_questions(text, text, integer, text, public.test_type, text, text, text, jsonb, timestamptz, boolean) to authenticated;
