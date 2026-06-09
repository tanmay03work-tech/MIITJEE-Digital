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
  v_is_active boolean := false;
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

  v_is_active := coalesce(v_test.is_started, false) or v_test.scheduled_at <= timezone('utc', now());

  if not (
    public.is_admin()
    or (
      v_is_active
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
    raise exception 'This test is locked until the scheduled time or an admin starts it.';
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

grant execute on function public.list_test_questions(uuid) to authenticated;
