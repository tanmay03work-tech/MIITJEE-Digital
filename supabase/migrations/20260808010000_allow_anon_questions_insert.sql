-- Migration: Allow dev/anon insert on questions and question_sets tables
drop policy if exists questions_insert_anon on public.questions;
create policy questions_insert_anon on public.questions
for insert to anon
with check (true);

drop policy if exists question_sets_insert_anon on public.question_sets;
create policy question_sets_insert_anon on public.question_sets
for insert to anon
with check (true);
