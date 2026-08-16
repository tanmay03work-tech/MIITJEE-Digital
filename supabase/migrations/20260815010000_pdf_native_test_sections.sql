-- Migration: 20260815010000_pdf_native_test_sections.sql
-- Description: Isolated section configuration table for PDF-Native multi-subject and single-subject tests

create table if not exists public.pdf_native_test_sections (
  id text primary key,
  test_id text not null references public.pdf_native_tests(id) on delete cascade,
  subject text not null default 'Physics',
  section_order integer not null default 1,
  question_start integer not null,
  question_end integer not null,
  mcq_count integer not null default 0,
  integer_count integer not null default 0,
  correct_marks numeric not null default 4,
  negative_marks numeric not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint unique_test_section_order unique (test_id, section_order)
);

create index if not exists idx_pdf_native_test_sections_test_id on public.pdf_native_test_sections(test_id);

alter table public.pdf_native_test_sections enable row level security;

drop policy if exists pdf_native_test_sections_read_all on public.pdf_native_test_sections;
create policy pdf_native_test_sections_read_all on public.pdf_native_test_sections
for select using (true);

drop policy if exists pdf_native_test_sections_write_admin on public.pdf_native_test_sections;
create policy pdf_native_test_sections_write_admin on public.pdf_native_test_sections
for all using (true) with check (true);
