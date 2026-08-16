-- Migration: Fix record v_test has no field correct_marks error in submit_test_attempt
-- Date: 2026-08-09

-- Ensure correct_marks, wrong_marks, unattempted_marks columns exist on tests table
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS correct_marks NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS wrong_marks NUMERIC NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS unattempted_marks NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.submit_test_attempt(
  p_test_id UUID,
  p_answers JSONB,
  p_student_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_total_questions INTEGER := 0;
  v_correct_answers INTEGER := 0;
  v_wrong_answers INTEGER := 0;
  v_unattempted INTEGER := 0;
  v_score INTEGER := 0;
  v_attempt public.test_attempts;
  v_user JSONB;
  v_result JSONB;
  v_leaderboard JSONB;
  v_overall_leaderboard JSONB;
  v_profile public.profiles;
  v_test RECORD;
  v_leaderboard_batch_id TEXT;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_correct_marks NUMERIC := 4;
  v_wrong_marks NUMERIC := -1;
  v_unattempted_marks NUMERIC := 0;
  v_final_student_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.test_attempts
    WHERE test_id = p_test_id
      AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You have already given this test.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  SELECT *
  INTO v_test
  FROM public.tests
  WHERE id = p_test_id
    AND is_published = TRUE
    AND deleted_at IS NULL;

  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Test not found';
  END IF;

  IF NOT public.is_admin()
    AND NOT (
      COALESCE(v_test.is_started, FALSE)
      OR COALESCE(v_test.started_at, v_test.scheduled_at, v_now) <= v_now
    ) THEN
    RAISE EXCEPTION 'This test is locked until an admin starts it.';
  END IF;

  IF v_test.type = 'weekly' AND NOT public.is_admin() THEN
    IF NOT (
      v_profile.batch_id IS NOT NULL
      AND v_profile.batch_id = v_test.batch_id
    ) THEN
      RAISE EXCEPTION 'Weekly tests are only for students of the matching batch';
    END IF;
  END IF;

  IF v_test.type = 'scholarship' THEN
    IF NOT public.is_admin() AND v_profile.role = 'miitjee_student' THEN
      RAISE EXCEPTION 'MIITJEE students cannot attempt scholarship tests';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.scholarship_registrations
      WHERE test_id = p_test_id
        AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Scholarship registration is required before starting the test';
    END IF;
  END IF;

  v_final_student_name := COALESCE(NULLIF(TRIM(p_student_name), ''), v_profile.full_name, 'Student');

  -- Load test marking scheme safely if specified
  v_correct_marks := COALESCE((to_jsonb(v_test) ->> 'correct_marks')::NUMERIC, 4);
  v_wrong_marks := COALESCE((to_jsonb(v_test) ->> 'wrong_marks')::NUMERIC, -1);
  v_unattempted_marks := COALESCE((to_jsonb(v_test) ->> 'unattempted_marks')::NUMERIC, 0);

  -- Count total questions
  SELECT COUNT(*)::INT
  INTO v_total_questions
  FROM public.test_questions
  WHERE test_id = p_test_id;

  -- Count correct answers (selected answer matches correct answer and answer is non-empty)
  SELECT COUNT(*)::INT
  INTO v_correct_answers
  FROM public.test_questions q
  WHERE q.test_id = p_test_id
    AND NULLIF(TRIM(COALESCE(p_answers ->> q.id::TEXT, '')), '') IS NOT NULL
    AND LOWER(TRIM(COALESCE(p_answers ->> q.id::TEXT, ''))) = LOWER(TRIM(COALESCE(q.correct_answer, '')));

  -- Count attempted questions total
  SELECT COUNT(*)::INT
  INTO v_wrong_answers
  FROM public.test_questions q
  WHERE q.test_id = p_test_id
    AND NULLIF(TRIM(COALESCE(p_answers ->> q.id::TEXT, '')), '') IS NOT NULL
    AND LOWER(TRIM(COALESCE(p_answers ->> q.id::TEXT, ''))) <> LOWER(TRIM(COALESCE(q.correct_answer, '')));

  -- Calculate unattempted count
  v_unattempted := GREATEST(0, v_total_questions - v_correct_answers - v_wrong_answers);

  -- Calculate score: (correct * +4) + (wrong * -1) + (unattempted * 0)
  v_score := ROUND(
    (v_correct_answers::NUMERIC * v_correct_marks) +
    (v_wrong_answers::NUMERIC * v_wrong_marks) +
    (v_unattempted::NUMERIC * v_unattempted_marks)
  )::INT;

  -- Insert attempt record including student_name, wrong_answers and unattempted
  INSERT INTO public.test_attempts (
    test_id,
    user_id,
    student_name,
    answers,
    score,
    correct_answers,
    wrong_answers,
    unattempted,
    total_questions,
    percentile,
    submitted_at
  )
  VALUES (
    p_test_id,
    v_uid,
    v_final_student_name,
    p_answers,
    v_score,
    v_correct_answers,
    v_wrong_answers,
    v_unattempted,
    v_total_questions,
    0,
    v_now
  )
  RETURNING * INTO v_attempt;

  -- Recalculate percentiles for this test
  WITH ranked AS (
    SELECT
      id,
      PERCENT_RANK() OVER (ORDER BY score ASC, submitted_at DESC) * 100 AS calc_percentile
    FROM public.test_attempts
    WHERE test_id = p_test_id
  )
  UPDATE public.test_attempts a
  SET percentile = ROUND(r.calc_percentile::NUMERIC, 2)::DOUBLE PRECISION
  FROM ranked r
  WHERE a.id = r.id;

  SELECT percentile INTO v_attempt.percentile
  FROM public.test_attempts
  WHERE id = v_attempt.id;

  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'role', p.role,
    'batch_id', p.batch_id
  )
  INTO v_user
  FROM public.profiles p
  WHERE p.id = v_uid;

  v_leaderboard_batch_id := COALESCE(v_test.batch_id, v_profile.batch_id);

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_leaderboard
  FROM (
    SELECT *
    FROM public.test_attempt_summaries
    WHERE test_id = p_test_id
      AND (v_leaderboard_batch_id IS NULL OR batch_id = v_leaderboard_batch_id)
    ORDER BY rank ASC, submitted_at ASC
    LIMIT 20
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_overall_leaderboard
  FROM (
    SELECT *
    FROM public.test_attempt_summaries
    WHERE test_id = p_test_id
    ORDER BY rank ASC, submitted_at ASC
    LIMIT 20
  ) r;

  v_result := jsonb_build_object(
    'attempt_id', v_attempt.id,
    'result_id', v_attempt.id,
    'test_id', v_attempt.test_id,
    'user_id', v_attempt.user_id,
    'student_name', v_final_student_name,
    'score', v_attempt.score,
    'correct_answers', v_attempt.correct_answers,
    'wrong_answers', v_attempt.wrong_answers,
    'unattempted', v_attempt.unattempted,
    'total_questions', v_attempt.total_questions,
    'percentile', v_attempt.percentile,
    'submitted_at', v_attempt.submitted_at
  );

  RETURN jsonb_build_object(
    'attempt', row_to_json(v_attempt),
    'result', v_result,
    'user', v_user,
    'leaderboard', v_leaderboard,
    'overall_leaderboard', v_overall_leaderboard
  );
END;
$$;
