-- Migration: Ensure list_available_tests and test_catalog allow unassigned normal students for Open for All exams
-- Date: 2026-08-09

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
    COALESCE(t.is_open_for_all, FALSE) AS is_open_for_all,
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
    AND (
      public.is_admin()
      OR COALESCE(t.is_open_for_all, FALSE) = TRUE
      OR (
        t.type = 'scholarship'
        AND COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), 'student') <> 'miitjee_student'
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.batch_id IS NOT NULL
          AND p.batch_id = t.batch_id
      )
    )
  ORDER BY t.scheduled_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_available_tests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_tests() TO anon;

-- Refresh public.test_catalog view matching exact existing column layout
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
  COALESCE(t.is_open_for_all, FALSE) AS is_open_for_all,
  COALESCE(t.is_link_revoked, FALSE) AS is_link_revoked,
  t.link_expires_at
FROM public.tests t
LEFT JOIN public.test_questions q ON q.test_id = t.id
WHERE t.is_published = TRUE
  AND t.deleted_at IS NULL
GROUP BY t.id;

GRANT SELECT ON public.test_catalog TO authenticated;
GRANT SELECT ON public.test_catalog TO anon;
