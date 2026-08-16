-- Migration: 20260815020000_pdf_native_sets.sql
-- Description: Isolated PDF-Native Sets and Set Questions junction tables

-- 1. Create PDF-Native Sets table
create table if not exists public.pdf_native_sets (
  id text primary key,
  set_name text not null,
  source_pdf_id text not null,
  pdf_url text,
  subject text not null default 'Physics',
  description text,
  total_questions integer not null default 0,
  status text not null default 'READY', -- 'DRAFT', 'READY', 'ARCHIVED'
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table public.pdf_native_sets enable row level security;

drop policy if exists pdf_native_sets_read_all on public.pdf_native_sets;
create policy pdf_native_sets_read_all on public.pdf_native_sets
for select using (true);

drop policy if exists pdf_native_sets_write_admin on public.pdf_native_sets;
create policy pdf_native_sets_write_admin on public.pdf_native_sets
for all using (true) with check (true);

-- Indexes
create index if not exists idx_pdf_native_sets_source_pdf on public.pdf_native_sets(source_pdf_id);
create index if not exists idx_pdf_native_sets_status on public.pdf_native_sets(status);
create index if not exists idx_pdf_native_sets_created_at on public.pdf_native_sets(created_at desc);

-- 2. Create PDF-Native Set Questions junction table
create table if not exists public.pdf_native_set_questions (
  id text primary key,
  set_id text not null references public.pdf_native_sets(id) on delete cascade,
  question_id text not null references public.pdf_native_questions(id) on delete cascade,
  order_index integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint unique_set_question unique (set_id, question_id),
  constraint unique_set_order unique (set_id, order_index)
);

-- Enable RLS
alter table public.pdf_native_set_questions enable row level security;

drop policy if exists pdf_native_set_questions_read_all on public.pdf_native_set_questions;
create policy pdf_native_set_questions_read_all on public.pdf_native_set_questions
for select using (true);

drop policy if exists pdf_native_set_questions_write_admin on public.pdf_native_set_questions;
create policy pdf_native_set_questions_write_admin on public.pdf_native_set_questions
for all using (true) with check (true);

-- Indexes
create index if not exists idx_pdf_native_set_questions_set_id on public.pdf_native_set_questions(set_id);
create index if not exists idx_pdf_native_set_questions_order on public.pdf_native_set_questions(set_id, order_index);
