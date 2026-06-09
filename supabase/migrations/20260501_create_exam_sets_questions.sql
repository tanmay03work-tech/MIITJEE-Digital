drop table if exists public.questions cascade;

create table public.questions (
  id bigint generated always as identity primary key,
  set_id bigint not null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  type text not null check (type in ('mcq', 'integer')),
  explanation text not null default '',
  image_url text,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_questions_set_id on public.questions (set_id);
create index idx_questions_type on public.questions (type);
create index idx_questions_created_at on public.questions (created_at desc);

alter table public.questions enable row level security;

create policy questions_read_all on public.questions
for select
using (true);

create policy questions_insert_authenticated on public.questions
for insert to authenticated
with check (true);

create policy questions_update_authenticated on public.questions
for update to authenticated
using (true)
with check (true);
