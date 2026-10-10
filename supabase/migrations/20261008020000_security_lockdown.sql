-- Migration: 20261008020000_security_lockdown.sql
-- Description: Complete answer-key isolation across all paths, direct table RLS lockdown, profiles update integrity, and authorization hardening.

-- 0. Ensure schema compatibility for optional multi-image options
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS option_image_urls jsonb;

-- 1. Create list_student_test_questions (strictly content only, NO correct_answer, integer_answer, or explanation)
CREATE OR REPLACE FUNCTION public.list_student_test_questions(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  question_type text,
  prompt text,
  options jsonb,
  image_url text,
  option_image_urls jsonb,
  subject_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.tests;
  v_profile public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
  SELECT * INTO v_test FROM public.tests t WHERE t.id = p_test_id AND t.is_published = true AND t.deleted_at IS NULL;

  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Test not found';
  END IF;

  IF v_test.type = 'scholarship' AND NOT public.is_admin() AND v_profile.role = 'miitjee_student' THEN
    RAISE EXCEPTION 'MIITJEE students cannot open scholarship tests';
  END IF;

  IF NOT (
    public.is_admin()
    OR COALESCE(v_test.is_open_for_all, FALSE) = TRUE
    OR v_test.batch_id IS NULL
    OR v_test.batch_id = 'ALL'
    OR LOWER(v_test.batch_id) = 'all batches'
    OR v_test.type = 'scholarship'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.batch_id IS NOT NULL AND p.batch_id = v_test.batch_id
    )
  ) THEN
    RAISE EXCEPTION 'You are not eligible to view this test';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.test_id,
    q.question_type::text,
    q.prompt,
    q.options,
    q.image_url,
    CASE 
      WHEN q.option_image_urls IS NULL THEN NULL::jsonb
      ELSE to_jsonb(q.option_image_urls)
    END AS option_image_urls,
    q.subject_label
  FROM public.test_questions q
  WHERE q.test_id = p_test_id
  ORDER BY q.position ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_student_test_questions(uuid) TO authenticated;

-- 2. Harden legacy list_test_questions so non-admins never receive answer keys
CREATE OR REPLACE FUNCTION public.list_test_questions(p_test_id uuid)
RETURNS TABLE (
  id uuid,
  test_id uuid,
  question_type text,
  prompt text,
  options jsonb,
  correct_answer text,
  integer_answer integer,
  explanation text,
  image_url text,
  subject_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.tests;
  v_profile public.profiles;
  v_is_adm boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_adm := public.is_admin();
  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
  SELECT * INTO v_test FROM public.tests t WHERE t.id = p_test_id AND t.is_published = true AND t.deleted_at IS NULL;

  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Test not found';
  END IF;

  IF v_test.type = 'scholarship' AND NOT v_is_adm AND v_profile.role = 'miitjee_student' THEN
    RAISE EXCEPTION 'MIITJEE students cannot open scholarship tests';
  END IF;

  IF NOT (
    v_is_adm
    OR COALESCE(v_test.is_open_for_all, FALSE) = TRUE
    OR v_test.batch_id IS NULL
    OR v_test.batch_id = 'ALL'
    OR LOWER(v_test.batch_id) = 'all batches'
    OR v_test.type = 'scholarship'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.batch_id IS NOT NULL AND p.batch_id = v_test.batch_id
    )
  ) THEN
    RAISE EXCEPTION 'You are not eligible to view this test';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.test_id,
    q.question_type::text,
    q.prompt,
    q.options,
    CASE WHEN v_is_adm THEN q.correct_answer ELSE ''::text END AS correct_answer,
    CASE WHEN v_is_adm THEN q.integer_answer ELSE NULL::integer END AS integer_answer,
    CASE WHEN v_is_adm THEN q.explanation ELSE ''::text END AS explanation,
    q.image_url,
    q.subject_label
  FROM public.test_questions q
  WHERE q.test_id = p_test_id
  ORDER BY q.position ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_test_questions(uuid) TO authenticated;

-- 3. Lock down public.test_questions table RLS - Admin only for direct table access
ALTER TABLE IF EXISTS public.test_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_questions_public_read_safe ON public.test_questions;
DROP POLICY IF EXISTS test_questions_read ON public.test_questions;
DROP POLICY IF EXISTS test_questions_admin_only ON public.test_questions;

CREATE POLICY test_questions_admin_only ON public.test_questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Prevent direct student inserts into test_attempts (Students must only submit via submit_test_attempt)
ALTER TABLE IF EXISTS public.test_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_attempts_student_insert_only ON public.test_attempts;
DROP POLICY IF EXISTS test_attempts_self_insert_safe ON public.test_attempts;
DROP POLICY IF EXISTS test_attempts_admin_insert ON public.test_attempts;

CREATE POLICY test_attempts_admin_insert ON public.test_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Ensure student self-read policy is strictly scoped to own attempts
DROP POLICY IF EXISTS test_attempts_student_read_self ON public.test_attempts;
DROP POLICY IF EXISTS test_attempts_public_read_safe ON public.test_attempts;

CREATE POLICY test_attempts_student_read_self ON public.test_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 5. Profiles privilege escalation prevention trigger
CREATE OR REPLACE FUNCTION public.check_profile_update_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify role';
    END IF;
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
      RAISE EXCEPTION 'Cannot modify approval_status';
    END IF;
    IF NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
      RAISE EXCEPTION 'Cannot modify batch_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_profile_update_integrity ON public.profiles;
CREATE TRIGGER trg_check_profile_update_integrity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_update_integrity();

-- 6. Enforce ownership/admin check on get_student_insights(p_user_id)
CREATE OR REPLACE FUNCTION public.get_student_insights(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := coalesce(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (auth.uid() = v_uid OR public.is_admin()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN jsonb_build_object(
    'summary',
    (
      WITH ordered_attempts AS (
        SELECT
          a.score,
          a.percentile,
          a.submitted_at
        FROM public.test_attempts a
        WHERE a.user_id = v_uid
        ORDER BY a.submitted_at ASC
      )
      SELECT to_jsonb(summary_row)
      FROM (
        SELECT
          count(*)::int AS tests_attempted,
          coalesce(round(avg(score)), 0)::int AS avg_score,
          coalesce(round(avg(percentile)), 0)::int AS avg_percentile,
          coalesce(max(score), 0)::int AS best_score,
          coalesce(max(percentile), 0)::int AS best_percentile,
          coalesce((array_agg(score ORDER BY submitted_at DESC))[1], 0)::int AS latest_score,
          coalesce((array_agg(percentile ORDER BY submitted_at DESC))[1], 0)::int AS latest_percentile,
          coalesce(
            (array_agg(score ORDER BY submitted_at DESC))[1] -
            (array_agg(score ORDER BY submitted_at ASC))[1],
            0
          )::int AS improvement_score
        FROM ordered_attempts
      ) summary_row
    ),
    'history',
    (
      SELECT coalesce(jsonb_agg(h_row), '[]'::jsonb)
      FROM (
        SELECT
          a.id AS attempt_id,
          a.test_id,
          t.title AS test_title,
          coalesce(t.subject, 'All') AS subject,
          a.score,
          a.percentile,
          a.rank,
          a.submitted_at
        FROM public.test_attempts a
        JOIN public.tests t ON t.id = a.test_id
        WHERE a.user_id = v_uid
        ORDER BY a.submitted_at DESC
        LIMIT 20
      ) h_row
    ),
    'subject_breakdown',
    (
      WITH student_answered_questions AS (
        SELECT
          coalesce(nullif(trim(q.subject_label), ''), nullif(trim(t.subject), ''), 'Physics') AS subject,
          a.id AS attempt_id,
          a.score,
          a.percentile,
          a.submitted_at,
          (taa.is_correct = true) AS is_correct
        FROM public.test_attempts a
        JOIN public.tests t ON t.id = a.test_id
        JOIN public.test_attempt_answers taa ON taa.attempt_id = a.id
        JOIN public.test_questions q ON q.id = taa.question_id
        WHERE a.user_id = v_uid
      )
      SELECT coalesce(jsonb_agg(s_row), '[]'::jsonb)
      FROM (
        SELECT
          subject,
          count(DISTINCT attempt_id)::int AS attempts,
          count(*)::int AS total_questions,
          count(*) FILTER (WHERE is_correct)::int AS correct_answers,
          coalesce(round((count(*) FILTER (WHERE is_correct)::numeric / nullif(count(*), 0)::numeric) * 100), 0)::int AS accuracy_percent,
          coalesce(round(avg(score)), 0)::int AS avg_score,
          coalesce(round(avg(percentile)), 0)::int AS avg_percentile,
          coalesce((array_agg(score ORDER BY submitted_at DESC))[1], 0)::int AS latest_score,
          coalesce((array_agg(percentile ORDER BY submitted_at DESC))[1], 0)::int AS latest_percentile,
          coalesce(
            (array_agg(score ORDER BY submitted_at DESC))[1] -
            (array_agg(score ORDER BY submitted_at ASC))[1],
            0
          )::int AS recent_delta
        FROM student_answered_questions
        GROUP BY subject
      ) s_row
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_insights(uuid) TO authenticated;

-- 7. Lock down public.reattempt_requests RLS
ALTER TABLE IF EXISTS public.reattempt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert to reattempt_requests" ON public.reattempt_requests;
DROP POLICY IF EXISTS "Allow read reattempt_requests" ON public.reattempt_requests;
DROP POLICY IF EXISTS "Allow update reattempt_requests" ON public.reattempt_requests;
DROP POLICY IF EXISTS "Allow delete reattempt_requests" ON public.reattempt_requests;
DROP POLICY IF EXISTS reattempt_requests_insert ON public.reattempt_requests;
DROP POLICY IF EXISTS reattempt_requests_select ON public.reattempt_requests;
DROP POLICY IF EXISTS reattempt_requests_update ON public.reattempt_requests;
DROP POLICY IF EXISTS reattempt_requests_delete ON public.reattempt_requests;

CREATE POLICY reattempt_requests_insert ON public.reattempt_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY reattempt_requests_select ON public.reattempt_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY reattempt_requests_update ON public.reattempt_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY reattempt_requests_delete ON public.reattempt_requests
  FOR DELETE TO authenticated
  USING (public.is_admin());
