-- Migration: Add Test Access Control (Open for All vs Batch Only) to PDF-Native Tests
-- Date: 2026-08-16

-- 1. Add visibility column to pdf_native_tests if it does not exist
ALTER TABLE public.pdf_native_tests 
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'OPEN_FOR_ALL';

-- 2. Create isolated PDF-Native Test Batch Access junction table
CREATE TABLE IF NOT EXISTS public.pdf_native_test_batch_access (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES public.pdf_native_tests(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_pdf_test_batch UNIQUE (test_id, batch_id)
);

-- Enable RLS
ALTER TABLE public.pdf_native_test_batch_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_native_test_batch_access_read_all ON public.pdf_native_test_batch_access;
CREATE POLICY pdf_native_test_batch_access_read_all ON public.pdf_native_test_batch_access
FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_test_batch_access_write_admin ON public.pdf_native_test_batch_access;
CREATE POLICY pdf_native_test_batch_access_write_admin ON public.pdf_native_test_batch_access
FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pdf_native_test_batch_access_test_id ON public.pdf_native_test_batch_access(test_id);
CREATE INDEX IF NOT EXISTS idx_pdf_native_test_batch_access_batch_id ON public.pdf_native_test_batch_access(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pdf_native_test_batch_access TO authenticated, anon;
