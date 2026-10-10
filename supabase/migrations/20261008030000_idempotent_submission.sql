-- Migration: 20261008030000_idempotent_submission.sql
-- Description: Strictly idempotent submit_test_attempt RPC with transaction advisory locks, duplicate prevention, and zero-mass-lock percentile calculation.

-- 1. Create fast lookup index for user test submissions without destroying historical reattempts
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_test_submitted ON public.test_attempts (test_id, user_id, submitted_at DESC);

-- 2. Strictly idempotent submit_test_attempt
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
  v_calculated_percentile DOUBLE PRECISION := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Transaction-level advisory lock per (test_id, user_id) to serialize concurrent submissions
  PERFORM pg_advisory_xact_lock(hashtext('submit_' || p_test_id::TEXT || '_' || v_uid::TEXT));

  -- IDEMPOTENCY CHECK: If official attempt already exists, return it immediately without error
  SELECT * INTO v_attempt
  FROM public.test_attempts
  WHERE test_id = p_test_id AND user_id = v_uid
  LIMIT 1;

  IF v_attempt.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
    INTO v_leaderboard
    FROM (
      SELECT * FROM public.test_attempt_summaries
      WHERE test_id = p_test_id
      ORDER BY rank ASC, submitted_at ASC
      LIMIT 20
    ) r;

    RETURN jsonb_build_object(
      'attempt', row_to_json(v_attempt),
      'result', jsonb_build_object(
        'id', v_attempt.id, 'attempt_id', v_attempt.id, 'result_id', v_attempt.id,
        'test_id', v_attempt.test_id, 'user_id', v_attempt.user_id, 'student_name', v_attempt.student_name,
        'score', v_attempt.score, 'correct_answers', v_attempt.correct_answers, 'wrong_answers', v_attempt.wrong_answers,
        'unattempted', v_attempt.unattempted, 'total_questions', v_attempt.total_questions,
        'percentile', v_attempt.percentile, 'submitted_at', v_attempt.submitted_at
      ),
      'user', (SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'batch_id', p.batch_id) FROM public.profiles p WHERE p.id = v_uid),
      'leaderboard', v_leaderboard,
      'overall_leaderboard', v_leaderboard,
      'is_existing', true
    );
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

  -- Deterministic percentile calculation against existing attempts without mass table UPDATE
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 100.0
      ELSE ROUND((COUNT(*) FILTER (WHERE score < v_score)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)::DOUBLE PRECISION
    END INTO v_calculated_percentile
  FROM public.test_attempts
  WHERE test_id = p_test_id;

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
    WHERE q.test_id = p_test_id
    ON CONFLICT DO NOTHING;
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
