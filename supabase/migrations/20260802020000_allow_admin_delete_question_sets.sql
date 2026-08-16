-- Migration: Allow admin deletion of question sets & questions

-- 1. Create RPC function for set deletion with SECURITY DEFINER
create or replace function public.delete_question_set(p_set_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.questions where set_id = p_set_id;
  delete from public.question_sets where set_id = p_set_id;
  return 'set_deleted';
end;
$$;

grant execute on function public.delete_question_set(bigint) to authenticated;
grant execute on function public.delete_question_set(bigint) to anon;

-- 2. Add RLS DELETE policies for authenticated users on questions & question_sets tables
drop policy if exists questions_delete_authenticated on public.questions;
create policy questions_delete_authenticated on public.questions
for delete to authenticated
using (true);

drop policy if exists question_sets_delete_authenticated on public.question_sets;
create policy question_sets_delete_authenticated on public.question_sets
for delete to authenticated
using (true);
