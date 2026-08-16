-- Migration: 20260816020000_pdf_native_multi_set_and_schedule.sql
-- Description: Multi-Set Test association, schedule timestamp columns, and section set linkages

-- 1. Add schedule columns to pdf_native_tests
ALTER TABLE public.pdf_native_tests
ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- 2. Create junction table for Multi-Set Test configuration (pdf_native_test_sets)
CREATE TABLE IF NOT EXISTS public.pdf_native_test_sets (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES public.pdf_native_tests(id) ON DELETE CASCADE,
  set_id TEXT NOT NULL REFERENCES public.pdf_native_sets(id) ON DELETE RESTRICT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_pdf_test_set UNIQUE (test_id, set_id)
);

-- 3. Add set_id and question_type to pdf_native_test_sections if not exists
ALTER TABLE public.pdf_native_test_sections
ADD COLUMN IF NOT EXISTS set_id TEXT REFERENCES public.pdf_native_sets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'MCQ';

-- Enable RLS
ALTER TABLE public.pdf_native_test_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_native_test_sets_read_all ON public.pdf_native_test_sets;
CREATE POLICY pdf_native_test_sets_read_all ON public.pdf_native_test_sets
FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_test_sets_write_admin ON public.pdf_native_test_sets;
CREATE POLICY pdf_native_test_sets_write_admin ON public.pdf_native_test_sets
FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pdf_native_test_sets_test_id ON public.pdf_native_test_sets(test_id);
CREATE INDEX IF NOT EXISTS idx_pdf_native_test_sets_set_id ON public.pdf_native_test_sets(set_id);
CREATE INDEX IF NOT EXISTS idx_pdf_native_test_sets_order ON public.pdf_native_test_sets(test_id, order_index);
CREATE INDEX IF NOT EXISTS idx_pdf_native_tests_schedule ON public.pdf_native_tests(starts_at, ends_at);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdf_native_test_sets TO authenticated, anon;
