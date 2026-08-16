-- Phase 3: Exam Draft Auto-Save Migration
-- Add status enum ('DRAFT', 'PUBLISHED', 'ENDED', 'ARCHIVED') and marking scheme columns to public.tests

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('DRAFT', 'PUBLISHED', 'ENDED', 'ARCHIVED')) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS correct_marks NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS wrong_marks NUMERIC NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS unattempted_marks NUMERIC NOT NULL DEFAULT 0;

-- Ensure existing published tests have status = 'PUBLISHED', unpublished have status = 'DRAFT'
UPDATE public.tests
SET status = CASE WHEN is_published = TRUE THEN 'PUBLISHED' ELSE 'DRAFT' END
WHERE status IS NULL OR status = 'PUBLISHED';

-- Create index on status for fast filtering
CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests (status);

-- Update RLS or views if required: Only PUBLISHED tests are visible to non-admin students
CREATE OR REPLACE FUNCTION public.get_available_student_tests(
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.tests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_batch TEXT;
  v_user_role TEXT;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT batch_id, role INTO v_user_batch, v_user_role
    FROM public.profiles
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.tests
  WHERE deleted_at IS NULL
    AND is_published = TRUE
    AND status = 'PUBLISHED'
    AND (
      v_user_role = 'admin'
      OR is_open_for_all = TRUE
      OR batch_id IS NULL
      OR (v_user_batch IS NOT NULL AND batch_id = v_user_batch)
    );
END;
$$;
