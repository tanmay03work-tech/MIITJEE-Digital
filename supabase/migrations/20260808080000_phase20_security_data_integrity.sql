-- Phase 20: Security & Data Integrity Migration
-- Strict RLS policies and RPC search_path hardening

-- 1. Ensure RLS enabled on core tables
ALTER TABLE IF EXISTS public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.active_exam_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Restrict non-admin access to PUBLISHED tests only
DROP POLICY IF EXISTS tests_student_read_strict ON public.tests;
CREATE POLICY tests_student_read_strict ON public.tests
  FOR SELECT TO authenticated
  USING (
    is_published = TRUE
    AND (status IS NULL OR status = 'PUBLISHED')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.approval_status = 'approved'
    )
  );

-- 3. Restrict Question Bank access to approved admins only
DROP POLICY IF EXISTS question_bank_admin_only ON public.question_bank;
CREATE POLICY question_bank_admin_only ON public.question_bank
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.approval_status = 'approved'
    )
  );

-- 4. Prevent student score tampering on test_attempts (Students can only INSERT their own attempt)
DROP POLICY IF EXISTS test_attempts_student_insert_only ON public.test_attempts;
CREATE POLICY test_attempts_student_insert_only ON public.test_attempts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS test_attempts_student_read_self ON public.test_attempts;
CREATE POLICY test_attempts_student_read_self ON public.test_attempts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.approval_status = 'approved'
    )
  );
