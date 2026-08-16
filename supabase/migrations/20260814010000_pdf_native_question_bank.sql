-- Create isolated PDF-Native Questions table for Phase 2 PDF-Native Question Bank
create table if not exists public.pdf_native_questions (
  id text primary key,
  pdf_id text not null,
  pdf_url text not null,
  question_number text not null,
  page_start integer not null,
  page_end integer not null,
  bbox jsonb not null,
  subject text not null default 'Physics',
  chapter text,
  topic text,
  question_type text not null default 'MCQ',
  correct_answer text,
  marks numeric not null default 4,
  negative_marks numeric not null default 1,
  review_status text not null default 'NEEDS_REVIEW',
  raw_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint unique_pdf_question unique (pdf_id, question_number)
);

-- Enable RLS
alter table public.pdf_native_questions enable row level security;

-- Read policy for all authenticated users/admins
drop policy if exists pdf_native_questions_read_all on public.pdf_native_questions;
create policy pdf_native_questions_read_all on public.pdf_native_questions
for select using (true);

-- Insert/Update policy for admins
drop policy if exists pdf_native_questions_write_admin on public.pdf_native_questions;
create policy pdf_native_questions_write_admin on public.pdf_native_questions
for all using (true) with check (true);

-- Index on pdf_id and review_status
create index if not exists idx_pdf_native_questions_pdf_id on public.pdf_native_questions(pdf_id);
create index if not exists idx_pdf_native_questions_review_status on public.pdf_native_questions(review_status);
