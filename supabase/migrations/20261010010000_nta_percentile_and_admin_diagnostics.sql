-- Migration: 20261010010000_nta_percentile_and_admin_diagnostics.sql
-- Description: Authoritative NTA percentile calculation, active_exam_sessions table,
-- diagnostics RPCs, admin actions (force submit, extend time, reset warnings),
-- activity logging idempotency, and test creation with is_open_for_all.

-- ============================================================================
-- 1. Active Exam Sessions Table & Policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.active_exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  current_question_index INT NOT NULL DEFAULT 0,
  attempted_count INT NOT NULL DEFAULT 0,
  unattempted_count INT NOT NULL DEFAULT 0,
  flagged_count INT NOT NULL DEFAULT 0,
  violations_count INT NOT NULL DEFAULT 0,
  time_extended_minutes INT NOT NULL DEFAULT 0,
  device_info TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_active_session UNIQUE (test_id, user_id)
);

ALTER TABLE public.active_exam_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access on active_exam_sessions' AND tablename = 'active_exam_sessions') THEN
    CREATE POLICY "Admins full access on active_exam_sessions"
      ON public.active_exam_sessions FOR ALL TO authenticated
      USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students manage own active_exam_sessions' AND tablename = 'active_exam_sessions') THEN
    CREATE POLICY "Students manage own active_exam_sessions"
      ON public.active_exam_sessions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_exam_sessions TO authenticated;

-- ============================================================================
-- 2. Admin Diagnostics RPCs & Safe Admin Actions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_force_submit_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess public.active_exam_sessions;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  SELECT * INTO v_sess FROM public.active_exam_sessions WHERE id = p_session_id;
  IF v_sess.id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.active_exam_sessions
  SET status = 'FORCE_SUBMITTED', last_active_at = timezone('utc', now())
  WHERE id = p_session_id;

  IF to_regclass('public.admin_auto_submit_events') IS NOT NULL THEN
    INSERT INTO public.admin_auto_submit_events (test_id, user_id, reason, triggered_at)
    VALUES (v_sess.test_id, v_sess.user_id, 'Admin force-submitted exam session via diagnostics', timezone('utc', now()))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_submit_session(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_extend_session_time(p_session_id UUID, p_minutes INT DEFAULT 15)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  UPDATE public.active_exam_sessions
  SET time_extended_minutes = COALESCE(time_extended_minutes, 0) + GREATEST(1, p_minutes),
      last_active_at = timezone('utc', now())
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_extend_session_time(UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_session_warnings(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  SELECT status INTO v_status FROM public.active_exam_sessions WHERE id = p_session_id;
  IF v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- CRITICAL RULE: Reset-warnings cannot reopen or modify an already submitted attempt
  IF v_status IN ('SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED') THEN
    RAISE EXCEPTION 'Cannot reset warnings on a completed or submitted exam attempt';
  END IF;

  UPDATE public.active_exam_sessions
  SET violations_count = 0,
      status = 'IN_PROGRESS',
      last_active_at = timezone('utc', now())
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_session_warnings(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_diagnostics_sessions(
  p_test_id UUID DEFAULT NULL
)
RETURNS TABLE (
  session_id UUID,
  test_id UUID,
  test_title TEXT,
  user_id UUID,
  student_name TEXT,
  batch_id TEXT,
  status TEXT,
  current_question_index INT,
  attempted_count INT,
  unattempted_count INT,
  flagged_count INT,
  violations_count INT,
  time_extended_minutes INT,
  device_info TEXT,
  last_active_at TIMESTAMPTZ,
  issue_code TEXT,
  issue_reason TEXT,
  suggested_action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := public.is_admin();
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.test_id,
    COALESCE(t.title, 'General Examination') AS test_title,
    s.user_id,
    COALESCE(p.full_name, 'Student') AS student_name,
    COALESCE(t.batch_id, p.batch_id) AS batch_id,
    s.status,
    s.current_question_index,
    s.attempted_count,
    s.unattempted_count,
    s.flagged_count,
    s.violations_count,
    s.time_extended_minutes,
    s.device_info,
    s.last_active_at,
    CASE
      WHEN s.violations_count >= 3 THEN 'MAX_TAB_VIOLATIONS'
      WHEN s.status = 'AUTO_SUBMITTED' THEN 'AUTO_SUBMIT_TRIGGERED'
      WHEN s.status = 'WARNING_TRIGGERED' THEN 'TAB_SWITCH_WARNING'
      WHEN s.status = 'DISCONNECTED' THEN 'NETWORK_DISCONNECT'
      WHEN s.status = 'EXPIRED' THEN 'SESSION_EXPIRED'
      ELSE 'ACTIVE_MONITORING'
    END AS issue_code,
    CASE
      WHEN s.violations_count >= 3 THEN 'Student reached maximum tab-switch violation limit (auto-submit policy).'
      WHEN s.status = 'AUTO_SUBMITTED' THEN 'Exam was automatically submitted due to policy or timer expiry.'
      WHEN s.status = 'WARNING_TRIGGERED' THEN format('Student has %s tab-switch violation warning(s).', s.violations_count)
      WHEN s.status = 'DISCONNECTED' THEN 'Client session heartbeat lost or student temporarily offline.'
      WHEN s.status = 'EXPIRED' THEN 'Test duration elapsed before final client submission.'
      ELSE 'Live exam session active and healthy.'
    END AS issue_reason,
    CASE
      WHEN s.violations_count >= 3 THEN 'Review student logs or reset warnings if accidental.'
      WHEN s.status = 'AUTO_SUBMITTED' THEN 'Confirm submission in attempts or allow reattempt if permitted.'
      WHEN s.status = 'WARNING_TRIGGERED' THEN 'Monitor student activity or reset warnings.'
      ELSE 'No immediate admin action required.'
    END AS suggested_action
  FROM public.active_exam_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN public.tests t ON t.id = s.test_id
  WHERE (p_test_id IS NULL OR s.test_id = p_test_id)
  ORDER BY s.last_active_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_diagnostics_sessions(UUID) TO authenticated;

-- ============================================================================
-- 3. Activity Logging Batch RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.insert_activity_logs(p_logs JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_logs IS NULL OR jsonb_array_length(p_logs) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_activity_logs (
    user_id, student_name, category, event_type, status, device_info, details, created_at
  )
  SELECT
    (elem ->> 'user_id')::UUID,
    elem ->> 'student_name',
    elem ->> 'category',
    elem ->> 'event_type',
    elem ->> 'status',
    elem ->> 'device_info',
    elem -> 'details',
    COALESCE((elem ->> 'created_at')::TIMESTAMPTZ, timezone('utc', now()))
  FROM jsonb_array_elements(p_logs) elem
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_activity_logs(JSONB) TO authenticated;

-- ============================================================================
-- 4. Test Creation with is_open_for_all
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_test_with_questions(
  p_title TEXT,
  p_description TEXT,
  p_duration_minutes INTEGER,
  p_batch_id TEXT,
  p_type public.test_type,
  p_subject TEXT,
  p_scholarship_admission_class TEXT,
  p_scholarship_target_exam TEXT,
  p_questions JSONB,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_is_open_for_all BOOLEAN DEFAULT FALSE
)
RETURNS public.test_catalog
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.tests;
  v_question JSONB;
  v_index INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_type = 'weekly' AND COALESCE(p_is_open_for_all, FALSE) = FALSE AND COALESCE(TRIM(p_batch_id), '') = '' THEN
    RAISE EXCEPTION 'Weekly restricted tests require a batch';
  END IF;

  IF p_type = 'scholarship' AND (
    COALESCE(TRIM(p_scholarship_admission_class), '') = ''
    OR COALESCE(TRIM(p_scholarship_target_exam), '') = ''
  ) THEN
    RAISE EXCEPTION 'Scholarship tests require admission class and target exam';
  END IF;

  INSERT INTO public.tests (
    title,
    description,
    duration_minutes,
    batch_id,
    type,
    subject,
    scheduled_at,
    created_by,
    scholarship_admission_class,
    scholarship_target_exam,
    is_started,
    started_at,
    is_open_for_all
  )
  VALUES (
    p_title,
    p_description,
    p_duration_minutes,
    CASE WHEN p_type = 'weekly' THEN NULLIF(p_batch_id, '') ELSE NULL END,
    p_type,
    p_subject,
    COALESCE(p_scheduled_at, timezone('utc', now())),
    auth.uid(),
    CASE WHEN p_type = 'scholarship' THEN LOWER(TRIM(p_scholarship_admission_class)) ELSE NULL END,
    CASE WHEN p_type = 'scholarship' THEN LOWER(TRIM(p_scholarship_target_exam)) ELSE NULL END,
    FALSE,
    NULL,
    COALESCE(p_is_open_for_all, FALSE)
  )
  RETURNING * INTO v_test;

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    v_index := v_index + 1;
    INSERT INTO public.test_questions (
      test_id,
      position,
      question_type,
      prompt,
      options,
      correct_answer,
      integer_answer,
      explanation,
      image_url,
      subject_label
    )
    VALUES (
      v_test.id,
      v_index,
      COALESCE(v_question ->> 'type', 'mcq'),
      v_question ->> 'prompt',
      CASE
        WHEN COALESCE(v_question ->> 'type', 'mcq') = 'mcq' THEN COALESCE(v_question -> 'options', '[]'::JSONB)
        ELSE '[]'::JSONB
      END,
      CASE
        WHEN COALESCE(v_question ->> 'type', 'mcq') = 'mcq'
          THEN COALESCE(
            v_question -> 'options' ->> GREATEST(0, COALESCE((v_question ->> 'correctOptionIndex')::INT, 0)),
            ''
          )
        ELSE ''
      END,
      CASE
        WHEN COALESCE(v_question ->> 'type', 'mcq') = 'integer'
          THEN NULLIF(v_question ->> 'integerAnswer', '')::INTEGER
        ELSE NULL
      END,
      COALESCE(v_question ->> 'explanation', ''),
      NULLIF(v_question ->> 'imageUrl', ''),
      NULLIF(TRIM(COALESCE(v_question ->> 'subjectLabel', '')), '')
    );
  END LOOP;

  PERFORM public.refresh_admin_analytics();

  RETURN (
    SELECT tc
    FROM public.test_catalog tc
    WHERE tc.id = v_test.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_test_with_questions(TEXT, TEXT, INTEGER, TEXT, public.test_type, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- ============================================================================
-- 5. Updated test_attempt_summaries View
-- ============================================================================
DROP VIEW IF EXISTS public.test_attempt_summaries CASCADE;

CREATE VIEW public.test_attempt_summaries
WITH (security_invoker = true) AS
WITH latest_attempts AS (
  SELECT DISTINCT ON (a.test_id, a.user_id)
    a.id,
    a.test_id,
    a.user_id,
    COALESCE(t.batch_id, p.batch_id) AS batch_id,
    COALESCE(NULLIF(TRIM(a.student_name), ''), p.full_name, 'Student') AS student_name,
    a.score,
    a.correct_answers,
    COALESCE(a.wrong_answers, 0) AS wrong_answers,
    COALESCE(a.unattempted, 0) AS unattempted,
    a.total_questions,
    a.submitted_at
  FROM public.test_attempts a
  JOIN public.profiles p ON p.id = a.user_id
  JOIN public.tests t ON t.id = a.test_id
  WHERE p.role IN ('student', 'miitjee_student')
    AND a.score IS NOT NULL
    AND a.submitted_at IS NOT NULL
  ORDER BY a.test_id, a.user_id, a.submitted_at DESC NULLS LAST, a.score DESC, a.id ASC
)
SELECT
  la.id,
  la.test_id,
  la.user_id,
  la.batch_id,
  la.student_name,
  la.score,
  la.correct_answers,
  la.wrong_answers,
  la.unattempted,
  la.total_questions,
  DENSE_RANK() OVER (
    PARTITION BY la.test_id, la.batch_id
    ORDER BY la.score DESC, la.submitted_at ASC
  )::INT AS rank,
  ROUND(
    (COUNT(*) OVER (
      PARTITION BY la.test_id, la.batch_id
      ORDER BY la.score ASC
      RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::NUMERIC / NULLIF(COUNT(*) OVER (PARTITION BY la.test_id, la.batch_id)::NUMERIC, 0)) * 100,
    2
  )::DOUBLE PRECISION AS percentile,
  la.submitted_at
FROM latest_attempts la;

GRANT SELECT ON public.test_attempt_summaries TO authenticated;

-- ============================================================================
-- 6. Authoritative get_leaderboard with Official NTA Cohort Percentile
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_test_leaderboard(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_leaderboard(public.leaderboard_scope, TEXT, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_scope public.leaderboard_scope DEFAULT 'overall_history',
  p_batch_id TEXT DEFAULT NULL,
  p_test_id UUID DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  batch_id TEXT,
  score INTEGER,
  percentile NUMERIC,
  rank INTEGER,
  tests_attempted INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN := public.is_admin();
  v_effective_batch_id TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_is_admin THEN
    v_effective_batch_id := p_batch_id;
  ELSE
    SELECT p.batch_id
    INTO v_effective_batch_id
    FROM public.profiles p
    WHERE p.id = v_uid;
  END IF;

  IF p_scope = 'test_wise' AND p_test_id IS NULL THEN
    RAISE EXCEPTION 'Test selection is required for test-wise leaderboard';
  END IF;

  IF p_scope = 'overall_history' THEN
    RETURN QUERY
    WITH student_aggregates AS (
      SELECT
        p.id AS user_id,
        p.full_name,
        p.batch_id,
        ROUND(AVG(a.score))::INT AS avg_score,
        COUNT(a.id)::INT AS tests_attempted
      FROM public.profiles p
      JOIN public.test_attempts a ON a.user_id = p.id
      WHERE p.role IN ('student', 'miitjee_student')
        AND a.score IS NOT NULL
        AND a.submitted_at IS NOT NULL
        AND (v_effective_batch_id IS NULL OR upper(trim(COALESCE(p.batch_id, ''))) = upper(trim(v_effective_batch_id)))
      GROUP BY p.id, p.full_name, p.batch_id
    ),
    ranked AS (
      SELECT
        sa.user_id,
        sa.full_name,
        sa.batch_id,
        sa.avg_score AS score,
        ROUND(
          (COUNT(*) OVER (
            ORDER BY sa.avg_score ASC
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::NUMERIC / NULLIF(COUNT(*) OVER ()::NUMERIC, 0)) * 100,
          1
        ) AS percentile,
        sa.tests_attempted,
        DENSE_RANK() OVER (
          ORDER BY sa.avg_score DESC, sa.tests_attempted DESC, sa.full_name ASC
        )::INT AS rank
      FROM student_aggregates sa
    )
    SELECT
      ranked.user_id,
      ranked.full_name,
      ranked.batch_id,
      ranked.score,
      ranked.percentile,
      ranked.rank,
      ranked.tests_attempted
    FROM ranked
    ORDER BY ranked.rank ASC, ranked.full_name ASC;

    RETURN;
  END IF;

  RETURN QUERY
  WITH eligible_attempts AS (
    SELECT DISTINCT ON (a.user_id)
      a.user_id,
      p.full_name,
      COALESCE(t.batch_id, p.batch_id) AS batch_id,
      a.score,
      a.submitted_at
    FROM public.test_attempts a
    JOIN public.profiles p ON p.id = a.user_id
    JOIN public.tests t ON t.id = a.test_id
    WHERE a.test_id = p_test_id
      AND a.score IS NOT NULL
      AND a.submitted_at IS NOT NULL
      AND p.role IN ('student', 'miitjee_student')
      AND (v_effective_batch_id IS NULL OR upper(trim(COALESCE(t.batch_id, p.batch_id, ''))) = upper(trim(v_effective_batch_id)))
    ORDER BY a.user_id, a.submitted_at DESC NULLS LAST, a.score DESC, a.id ASC
  ),
  ranked AS (
    SELECT
      ea.user_id,
      ea.full_name,
      ea.batch_id,
      ea.score,
      ROUND(
        (COUNT(*) OVER (
          ORDER BY ea.score ASC
          RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::NUMERIC / NULLIF(COUNT(*) OVER ()::NUMERIC, 0)) * 100,
        1
      ) AS percentile,
      1::INT AS tests_attempted,
      DENSE_RANK() OVER (
        ORDER BY ea.score DESC, ea.submitted_at ASC
      )::INT AS rank
    FROM eligible_attempts ea
  )
  SELECT
    ranked.user_id,
    ranked.full_name,
    ranked.batch_id,
    ranked.score,
    ranked.percentile,
    ranked.rank,
    ranked.tests_attempted
  FROM ranked
  ORDER BY ranked.rank ASC, ranked.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(public.leaderboard_scope, TEXT, UUID) TO authenticated;

-- ============================================================================
-- 7. Authoritative get_test_leaderboard
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_test_leaderboard(p_test_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  batch_id TEXT,
  score INTEGER,
  percentile NUMERIC,
  rank INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(t.batch_id, p.batch_id)
  INTO v_batch_id
  FROM public.profiles p
  LEFT JOIN public.tests t ON t.id = p_test_id
  WHERE p.id = v_uid;

  RETURN QUERY
  SELECT
    lb.user_id,
    lb.full_name,
    lb.batch_id,
    lb.score,
    lb.percentile,
    lb.rank
  FROM public.get_leaderboard('test_wise', v_batch_id, p_test_id) lb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_test_leaderboard(UUID) TO authenticated;

-- ============================================================================
-- 8. Authoritative submit_test_attempt with NTA Percentile & Idempotency
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_test_attempt(
  p_test_id UUID,
  p_answers JSONB,
  p_student_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles;
  v_test public.tests;
  v_attempt public.test_attempts;
  v_latest_attempt public.test_attempts;
  v_approved_reattempt_id UUID;
  v_total_questions INTEGER := 0;
  v_correct_answers INTEGER := 0;
  v_wrong_answers INTEGER := 0;
  v_unattempted INTEGER := 0;
  v_score INTEGER := 0;
  v_correct_marks NUMERIC := 4;
  v_wrong_marks NUMERIC := -1;
  v_unattempted_marks NUMERIC := 0;
  v_final_student_name TEXT;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_leaderboard JSONB := '[]'::JSONB;
  v_overall_leaderboard JSONB := '[]'::JSONB;
  v_calculated_percentile DOUBLE PRECISION := 100.0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Transaction-level advisory lock per (test_id, user_id) to serialize duplicate requests
  PERFORM pg_advisory_xact_lock(hashtext('submit_' || p_test_id::TEXT || '_' || v_uid::TEXT));

  -- Check existing attempt for user
  SELECT * INTO v_latest_attempt
  FROM public.test_attempts
  WHERE test_id = p_test_id AND user_id = v_uid
  ORDER BY submitted_at DESC NULLS LAST
  LIMIT 1;

  IF v_latest_attempt.id IS NOT NULL THEN
    IF to_regclass('public.reattempt_requests') IS NOT NULL THEN
      SELECT id INTO v_approved_reattempt_id
      FROM public.reattempt_requests
      WHERE test_id = p_test_id::TEXT
        AND user_id = v_uid
        AND status = 'approved'
      ORDER BY approved_at DESC NULLS LAST, created_at DESC
      LIMIT 1;
    END IF;

    -- Return existing attempt idempotently if no approved reattempt
    IF v_approved_reattempt_id IS NULL THEN
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
      INTO v_leaderboard
      FROM (
        SELECT * FROM public.test_attempt_summaries
        WHERE test_id = p_test_id
        ORDER BY rank ASC, submitted_at ASC
        LIMIT 20
      ) r;

      RETURN jsonb_build_object(
        'attempt', row_to_json(v_latest_attempt),
        'result', jsonb_build_object(
          'id', v_latest_attempt.id, 'attempt_id', v_latest_attempt.id, 'result_id', v_latest_attempt.id,
          'test_id', v_latest_attempt.test_id, 'user_id', v_latest_attempt.user_id, 'student_name', v_latest_attempt.student_name,
          'score', v_latest_attempt.score, 'correct_answers', v_latest_attempt.correct_answers, 'wrong_answers', v_latest_attempt.wrong_answers,
          'unattempted', v_latest_attempt.unattempted, 'total_questions', v_latest_attempt.total_questions,
          'percentile', v_latest_attempt.percentile, 'submitted_at', v_latest_attempt.submitted_at
        ),
        'user', (SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'batch_id', p.batch_id) FROM public.profiles p WHERE p.id = v_uid),
        'leaderboard', v_leaderboard,
        'overall_leaderboard', v_leaderboard,
        'is_existing', true
      );
    ELSE
      UPDATE public.reattempt_requests
      SET status = 'completed'
      WHERE id = v_approved_reattempt_id;
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_test FROM public.tests WHERE id = p_test_id AND is_published = TRUE AND deleted_at IS NULL;

  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Test not found';
  END IF;

  IF NOT public.is_admin()
    AND NOT (COALESCE(v_test.is_started, FALSE) OR COALESCE(v_test.started_at, v_test.scheduled_at, v_now) <= v_now) THEN
    RAISE EXCEPTION 'This test is locked until an admin starts it.';
  END IF;

  IF v_test.type = 'weekly'
    AND NOT public.is_admin()
    AND NOT (
      COALESCE(v_test.is_open_for_all, FALSE)
      OR v_test.batch_id IS NULL
      OR upper(trim(v_test.batch_id)) IN ('ALL', 'ALL BATCHES')
      OR (v_profile.batch_id IS NOT NULL AND v_profile.batch_id = v_test.batch_id)
    ) THEN
    RAISE EXCEPTION 'Weekly tests are only for students of the matching batch';
  END IF;

  IF v_test.type = 'scholarship' THEN
    IF NOT public.is_admin() AND v_profile.role = 'miitjee_student' THEN
      RAISE EXCEPTION 'MIITJEE students cannot attempt scholarship tests';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.scholarship_registrations WHERE test_id = p_test_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Scholarship registration is required before starting the test';
    END IF;
  END IF;

  v_final_student_name := COALESCE(NULLIF(TRIM(p_student_name), ''), v_profile.full_name, 'Student');
  v_correct_marks := COALESCE((to_jsonb(v_test) ->> 'correct_marks')::NUMERIC, 4);
  v_wrong_marks := COALESCE((to_jsonb(v_test) ->> 'wrong_marks')::NUMERIC, -1);
  v_unattempted_marks := COALESCE((to_jsonb(v_test) ->> 'unattempted_marks')::NUMERIC, 0);

  SELECT COUNT(*)::INT INTO v_total_questions FROM public.test_questions WHERE test_id = p_test_id;

  SELECT COUNT(*)::INT INTO v_correct_answers
  FROM public.test_questions q
  CROSS JOIN LATERAL (SELECT NULLIF(TRIM(COALESCE(p_answers ->> q.id::TEXT, '')), '') AS selected_answer) a
  WHERE q.test_id = p_test_id
    AND a.selected_answer IS NOT NULL
    AND (
      lower(trim(regexp_replace(a.selected_answer, '^Option\s+', '', 'i'))) = lower(trim(regexp_replace(coalesce(q.correct_answer, ''), '^Option\s+', '', 'i')))
      OR (
        q.question_type = 'integer'
        AND public.normalized_numeric_answer(a.selected_answer) IS NOT NULL
        AND public.normalized_numeric_answer(a.selected_answer) = public.normalized_numeric_answer(coalesce(q.integer_answer::TEXT, q.correct_answer, ''))
      )
    );

  SELECT COUNT(*)::INT INTO v_wrong_answers
  FROM public.test_questions q
  CROSS JOIN LATERAL (SELECT NULLIF(TRIM(COALESCE(p_answers ->> q.id::TEXT, '')), '') AS selected_answer) a
  WHERE q.test_id = p_test_id
    AND a.selected_answer IS NOT NULL
    AND NOT (
      lower(trim(regexp_replace(a.selected_answer, '^Option\s+', '', 'i'))) = lower(trim(regexp_replace(coalesce(q.correct_answer, ''), '^Option\s+', '', 'i')))
      OR (
        q.question_type = 'integer'
        AND public.normalized_numeric_answer(a.selected_answer) IS NOT NULL
        AND public.normalized_numeric_answer(a.selected_answer) = public.normalized_numeric_answer(coalesce(q.integer_answer::TEXT, q.correct_answer, ''))
      )
    );

  v_unattempted := GREATEST(0, v_total_questions - v_correct_answers - v_wrong_answers);
  v_score := ROUND(v_correct_answers * v_correct_marks + v_wrong_answers * v_wrong_marks + v_unattempted * v_unattempted_marks)::INT;

  -- NTA cohort percentile calculation excluding admins and staff:
  -- Percentile = 100 * (Number of eligible candidates with score <= v_score) / (Total eligible candidates)
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 100.0
      ELSE ROUND(((COUNT(*) FILTER (WHERE cohort.score <= v_score) + 1)::NUMERIC / (COUNT(*) + 1)::NUMERIC) * 100, 2)::DOUBLE PRECISION
    END INTO v_calculated_percentile
  FROM (
    SELECT DISTINCT ON (a.user_id) a.score
    FROM public.test_attempts a
    JOIN public.profiles pr ON pr.id = a.user_id
    WHERE a.test_id = p_test_id
      AND a.user_id != v_uid
      AND a.score IS NOT NULL
      AND a.submitted_at IS NOT NULL
      AND pr.role IN ('student', 'miitjee_student')
    ORDER BY a.user_id, a.submitted_at DESC NULLS LAST, a.score DESC, a.id ASC
  ) cohort;

  INSERT INTO public.test_attempts (
    test_id, user_id, student_name, answers, score, correct_answers, wrong_answers,
    unattempted, total_questions, percentile, submitted_at
  ) VALUES (
    p_test_id, v_uid, v_final_student_name, COALESCE(p_answers, '{}'::JSONB), v_score,
    v_correct_answers, v_wrong_answers, v_unattempted, v_total_questions, v_calculated_percentile, v_now
  )
  RETURNING * INTO v_attempt;

  IF to_regclass('public.test_attempt_answers') IS NOT NULL AND v_attempt.id IS NOT NULL THEN
    INSERT INTO public.test_attempt_answers (attempt_id, question_id, selected_answer, correct_answer, is_correct)
    SELECT
      v_attempt.id,
      q.id,
      COALESCE(p_answers ->> q.id::TEXT, ''),
      COALESCE(q.correct_answer, q.integer_answer::TEXT, ''),
      a.selected_answer IS NOT NULL AND (
        lower(trim(regexp_replace(a.selected_answer, '^Option\s+', '', 'i'))) = lower(trim(regexp_replace(coalesce(q.correct_answer, ''), '^Option\s+', '', 'i')))
        OR (
          q.question_type = 'integer'
          AND public.normalized_numeric_answer(a.selected_answer) IS NOT NULL
          AND public.normalized_numeric_answer(a.selected_answer) = public.normalized_numeric_answer(coalesce(q.integer_answer::TEXT, q.correct_answer, ''))
        )
      )
    FROM public.test_questions q
    CROSS JOIN LATERAL (SELECT NULLIF(TRIM(COALESCE(p_answers ->> q.id::TEXT, '')), '') AS selected_answer) a
    WHERE q.test_id = p_test_id;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
  INTO v_leaderboard
  FROM (
    SELECT * FROM public.test_attempt_summaries
    WHERE test_id = p_test_id
    ORDER BY rank ASC, submitted_at ASC
    LIMIT 20
  ) r;

  v_overall_leaderboard := v_leaderboard;

  RETURN jsonb_build_object(
    'attempt', row_to_json(v_attempt),
    'result', jsonb_build_object(
      'id', v_attempt.id, 'attempt_id', v_attempt.id, 'result_id', v_attempt.id,
      'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id, 'student_name', v_final_student_name,
      'score', v_attempt.score, 'correct_answers', v_attempt.correct_answers, 'wrong_answers', v_attempt.wrong_answers,
      'unattempted', v_attempt.unattempted, 'total_questions', v_attempt.total_questions,
      'percentile', v_attempt.percentile, 'submitted_at', v_attempt.submitted_at
    ),
    'user', (SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'batch_id', p.batch_id) FROM public.profiles p WHERE p.id = v_uid),
    'leaderboard', v_leaderboard,
    'overall_leaderboard', v_overall_leaderboard,
    'is_existing', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_test_attempt(UUID, JSONB, TEXT) TO authenticated;
