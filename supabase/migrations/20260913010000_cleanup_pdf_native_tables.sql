-- Migration: 20260913010000_cleanup_pdf_native_tables.sql
-- Description: Drop unused PDF Native builder tables and associated indexes/policies.

drop table if exists public.pdf_native_attempt_answers cascade;
drop table if exists public.pdf_native_attempts cascade;
drop table if exists public.pdf_native_test_sections cascade;
drop table if exists public.pdf_native_test_questions cascade;
drop table if exists public.pdf_native_test_sets cascade;
drop table if exists public.pdf_native_test_batch_access cascade;
drop table if exists public.pdf_native_set_questions cascade;
drop table if exists public.pdf_native_sets cascade;
drop table if exists public.pdf_native_questions cascade;
drop table if exists public.pdf_native_tests cascade;

-- Ensure standard question sets and test tables are in place
create table if not exists public.question_sets (
  set_id bigint primary key,
  pdf_name text not null,
  question_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_question_sets_created_at on public.question_sets (created_at desc);

alter table public.question_sets enable row level security;

drop policy if exists question_sets_read_all on public.question_sets;
create policy question_sets_read_all on public.question_sets
for select using (true);

drop policy if exists question_sets_insert_authenticated on public.question_sets;
create policy question_sets_insert_authenticated on public.question_sets
for insert to authenticated with check (true);

drop policy if exists question_sets_delete_authenticated on public.question_sets;
create policy question_sets_delete_authenticated on public.question_sets
for delete to authenticated using (true);

create table if not exists public.questions (
  id bigint generated always as identity primary key,
  set_id bigint not null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  type text not null check (type in ('mcq', 'integer')),
  explanation text not null default '',
  image_url text,
  subject_label text default 'Physics',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_questions_set_id on public.questions (set_id);
create index if not exists idx_questions_type on public.questions (type);

alter table public.questions enable row level security;

drop policy if exists questions_read_all on public.questions;
create policy questions_read_all on public.questions
for select using (true);

drop policy if exists questions_insert_authenticated on public.questions;
create policy questions_insert_authenticated on public.questions
for insert to authenticated with check (true);

drop policy if exists questions_update_authenticated on public.questions;
create policy questions_update_authenticated on public.questions
for update to authenticated using (true) with check (true);

drop policy if exists questions_delete_authenticated on public.questions;
create policy questions_delete_authenticated on public.questions
for delete to authenticated using (true);
