-- Migration: Ensure all published tests (both Standard and PDF-Native) are fully visible and readable to all users (students, miitjee_students, admins, and anon)
-- Date: 2026-08-15

-- 1. Grant full select permissions on all PDF-Native tables to authenticated and anon
GRANT SELECT ON TABLE public.pdf_native_tests TO authenticated, anon;
GRANT SELECT ON TABLE public.pdf_native_test_questions TO authenticated, anon;
GRANT SELECT ON TABLE public.pdf_native_test_sections TO authenticated, anon;
GRANT SELECT ON TABLE public.pdf_native_sets TO authenticated, anon;
GRANT SELECT ON TABLE public.pdf_native_set_questions TO authenticated, anon;
GRANT SELECT ON TABLE public.pdf_native_questions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pdf_native_attempts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pdf_native_attempt_answers TO authenticated, anon;

-- Ensure RLS policies allow reading for everyone
DROP POLICY IF EXISTS pdf_native_tests_read_all ON public.pdf_native_tests;
CREATE POLICY pdf_native_tests_read_all ON public.pdf_native_tests FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_test_questions_read_all ON public.pdf_native_test_questions;
CREATE POLICY pdf_native_test_questions_read_all ON public.pdf_native_test_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_test_sections_read_all ON public.pdf_native_test_sections;
CREATE POLICY pdf_native_test_sections_read_all ON public.pdf_native_test_sections FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_sets_read_all ON public.pdf_native_sets;
CREATE POLICY pdf_native_sets_read_all ON public.pdf_native_sets FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_set_questions_read_all ON public.pdf_native_set_questions;
CREATE POLICY pdf_native_set_questions_read_all ON public.pdf_native_set_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS pdf_native_questions_read_all ON public.pdf_native_questions;
CREATE POLICY pdf_native_questions_read_all ON public.pdf_native_questions FOR SELECT USING (true);

-- 2. Update list_available_tests function to return all published tests for all users
DROP FUNCTION IF EXISTS public.list_available_tests();

CREATE OR REPLACE FUNCTION public.list_available_tests()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  duration_minutes INTEGER,
  question_count INTEGER,
  batch_id TEXT,
  type public.test_type,
  subject TEXT,
  scheduled_at TIMESTAMPTZ,
  is_published BOOLEAN,
  is_started BOOLEAN,
  started_at TIMESTAMPTZ,
  scholarship_admission_class TEXT,
  scholarship_target_exam TEXT,
  share_code TEXT,
  is_open_for_all BOOLEAN,
  is_link_revoked BOOLEAN,
  link_expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.title,
    t.description,
    t.duration_minutes,
    qc.question_count,
    t.batch_id,
    t.type,
    t.subject,
    t.scheduled_at,
    t.is_published,
    t.is_started,
    t.started_at,
    t.scholarship_admission_class,
    t.scholarship_target_exam,
    t.share_code,
    COALESCE(t.is_open_for_all, t.batch_id IS NULL OR t.batch_id = 'ALL' OR LOWER(t.batch_id) = 'all batches', FALSE) AS is_open_for_all,
    COALESCE(t.is_link_revoked, FALSE) AS is_link_revoked,
    t.link_expires_at
  FROM public.tests t
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS question_count
    FROM public.test_questions q
    WHERE q.test_id = t.id
  ) qc ON TRUE
  WHERE t.is_published = TRUE
    AND t.deleted_at IS NULL
  ORDER BY t.scheduled_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_available_tests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_tests() TO anon;

-- 3. Refresh test_catalog view
CREATE OR REPLACE VIEW public.test_catalog
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.title,
  t.description,
  t.duration_minutes,
  t.batch_id,
  t.type,
  t.subject,
  t.scheduled_at,
  t.is_published,
  t.scholarship_admission_class,
  t.scholarship_target_exam,
  COUNT(q.id)::INT AS question_count,
  t.is_started,
  t.started_at,
  t.share_code,
  COALESCE(t.is_open_for_all, t.batch_id IS NULL OR t.batch_id = 'ALL' OR LOWER(t.batch_id) = 'all batches', FALSE) AS is_open_for_all,
  COALESCE(t.is_link_revoked, FALSE) AS is_link_revoked,
  t.link_expires_at
FROM public.tests t
LEFT JOIN public.test_questions q ON q.test_id = t.id
WHERE t.is_published = TRUE
  AND t.deleted_at IS NULL
GROUP BY t.id;

GRANT SELECT ON public.test_catalog TO authenticated;
GRANT SELECT ON public.test_catalog TO anon;
