drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests
for select using (
  auth.uid() is not null
  and is_published = true
  and (
    public.is_admin()
    or type = 'scholarship'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'miitjee_student'
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
      and t.is_published = true
      and (
        public.is_admin()
        or t.type = 'scholarship'
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'miitjee_student'
            and p.batch_id = t.batch_id
        )
      )
  )
);
