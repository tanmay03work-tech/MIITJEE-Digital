alter table if exists public.profiles enable row level security;
alter table if exists public.tests enable row level security;
alter table if exists public.test_questions enable row level security;
alter table if exists public.test_attempts enable row level security;

drop policy if exists profiles_public_read_safe on public.profiles;
create policy profiles_public_read_safe on public.profiles
for select to authenticated
using (true);

drop policy if exists profiles_self_update_safe on public.profiles;
create policy profiles_self_update_safe on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists tests_public_read_safe on public.tests;
create policy tests_public_read_safe on public.tests
for select to authenticated
using (true);

drop policy if exists test_questions_public_read_safe on public.test_questions;
create policy test_questions_public_read_safe on public.test_questions
for select to authenticated
using (true);

drop policy if exists test_attempts_public_read_safe on public.test_attempts;
create policy test_attempts_public_read_safe on public.test_attempts
for select to authenticated
using (true);

drop policy if exists test_attempts_self_insert_safe on public.test_attempts;
create policy test_attempts_self_insert_safe on public.test_attempts
for insert to authenticated
with check (auth.uid() = user_id);
