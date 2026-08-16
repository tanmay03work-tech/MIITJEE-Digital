-- Add UPDATE policy for questions table
drop policy if exists questions_update_anon on public.questions;
create policy questions_update_anon on public.questions
for update to anon
using (true)
with check (true);
