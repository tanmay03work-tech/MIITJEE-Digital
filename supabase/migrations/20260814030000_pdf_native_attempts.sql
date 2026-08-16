-- Create isolated PDF-Native Attempts table for Phase 5A
create table if not exists public.pdf_native_attempts (
  id text primary key,
  test_id text not null references public.pdf_native_tests(id) on delete cascade,
  user_id text,
  student_name text,
  total_questions integer not null,
  attempted_count integer not null,
  correct_count integer not null,
  wrong_count integer not null,
  unattempted_count integer not null,
  total_score numeric not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table public.pdf_native_attempts enable row level security;

drop policy if exists pdf_native_attempts_read_all on public.pdf_native_attempts;
create policy pdf_native_attempts_read_all on public.pdf_native_attempts
for select using (true);

drop policy if exists pdf_native_attempts_write_admin on public.pdf_native_attempts;
create policy pdf_native_attempts_write_admin on public.pdf_native_attempts
for all using (true) with check (true);

-- Create isolated PDF-Native Attempt Question Answers table
create table if not exists public.pdf_native_attempt_answers (
  id text primary key,
  attempt_id text not null references public.pdf_native_attempts(id) on delete cascade,
  question_id text not null references public.pdf_native_questions(id) on delete cascade,
  question_number text not null,
  selected_answer text, -- null if unattempted
  correct_answer text not null,
  status text not null, -- 'CORRECT', 'WRONG', 'UNATTEMPTED'
  awarded_marks numeric not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint unique_attempt_question unique (attempt_id, question_id)
);

-- Enable RLS
alter table public.pdf_native_attempt_answers enable row level security;

drop policy if exists pdf_native_attempt_answers_read_all on public.pdf_native_attempt_answers;
create policy pdf_native_attempt_answers_read_all on public.pdf_native_attempt_answers
for select using (true);

drop policy if exists pdf_native_attempt_answers_write_admin on public.pdf_native_attempt_answers;
create policy pdf_native_attempt_answers_write_admin on public.pdf_native_attempt_answers
for all using (true) with check (true);

-- Indexes
create index if not exists idx_pdf_native_attempts_test_id on public.pdf_native_attempts(test_id);
create index if not exists idx_pdf_native_attempts_user_id on public.pdf_native_attempts(user_id);
create index if not exists idx_pdf_native_attempt_answers_attempt_id on public.pdf_native_attempt_answers(attempt_id);
