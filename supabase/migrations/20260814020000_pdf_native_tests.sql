-- Create isolated PDF-Native Tests table for Phase 3 PDF-Native Test Creation
create table if not exists public.pdf_native_tests (
  id text primary key,
  title text not null,
  description text,
  duration_minutes integer not null default 60,
  subject text not null default 'Physics',
  total_questions integer not null default 0,
  status text not null default 'DRAFT', -- 'DRAFT', 'READY'
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table public.pdf_native_tests enable row level security;

drop policy if exists pdf_native_tests_read_all on public.pdf_native_tests;
create policy pdf_native_tests_read_all on public.pdf_native_tests
for select using (true);

drop policy if exists pdf_native_tests_write_admin on public.pdf_native_tests;
create policy pdf_native_tests_write_admin on public.pdf_native_tests
for all using (true) with check (true);

-- Create isolated PDF-Native Test Questions junction table
create table if not exists public.pdf_native_test_questions (
  id text primary key,
  test_id text not null references public.pdf_native_tests(id) on delete cascade,
  question_id text not null references public.pdf_native_questions(id) on delete cascade,
  order_index integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint unique_test_question unique (test_id, question_id),
  constraint unique_test_order unique (test_id, order_index)
);

-- Enable RLS
alter table public.pdf_native_test_questions enable row level security;

drop policy if exists pdf_native_test_questions_read_all on public.pdf_native_test_questions;
create policy pdf_native_test_questions_read_all on public.pdf_native_test_questions
for select using (true);

drop policy if exists pdf_native_test_questions_write_admin on public.pdf_native_test_questions;
create policy pdf_native_test_questions_write_admin on public.pdf_native_test_questions
for all using (true) with check (true);

-- Indexes
create index if not exists idx_pdf_native_test_questions_test_id on public.pdf_native_test_questions(test_id);
create index if not exists idx_pdf_native_test_questions_order on public.pdf_native_test_questions(test_id, order_index);
