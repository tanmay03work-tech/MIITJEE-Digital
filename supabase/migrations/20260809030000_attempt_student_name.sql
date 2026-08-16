-- Migration: Add student_name to test_attempts and update submit_test_attempt & test_attempt_summaries
-- Date: 2026-08-09

-- 1. Add student_name column to test_attempts
ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS student_name TEXT;

-- 2. Update test_attempt_summaries view to include student_name
DROP VIEW IF EXISTS public.test_attempt_summaries;

CREATE VIEW public.test_attempt_summaries
WITH (security_invoker = true) AS
SELECT
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
  DENSE_RANK() OVER (
    PARTITION BY a.test_id, COALESCE(t.batch_id, p.batch_id)
    ORDER BY a.score DESC, a.percentile DESC, a.submitted_at ASC
  )::INT AS rank,
  a.percentile,
  a.submitted_at
FROM public.test_attempts a
JOIN public.profiles p ON p.id = a.user_id
JOIN public.tests t ON t.id = a.test_id;

-- 3. Replace submit_test_attempt function to accept optional p_student_name
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

  -- Load test marking scheme if specified
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
    AND COALESCE(p_answers ->> q.id::text, '') <> ''
    AND (
      CASE
        WHEN q.question_type = 'mcq' THEN q.correct_answer = COALESCE(p_answers ->> q.id::text, '')
        WHEN q.question_type = 'integer' THEN q.integer_answer IS NOT NULL AND COALESCE(p_answers ->> q.id::text, '') = q.integer_answer::text
        ELSE FALSE
      END
    );

  -- Count unattempted questions (answer is null, missing, or empty string)
  SELECT COUNT(*)::INT
  INTO v_unattempted
  FROM public.test_questions q
  WHERE q.test_id = p_test_id
    AND COALESCE(p_answers ->> q.id::text, '') = '';

  -- Wrong answers = total - correct - unattempted
  v_wrong_answers := GREATEST(0, v_total_questions - v_correct_answers - v_unattempted);

  -- Calculate score using marking scheme (+4 / -1 / 0)
  v_score := ROUND(
    (v_correct_answers::NUMERIC * v_correct_marks) +
    (v_wrong_answers::NUMERIC * v_wrong_marks) +
    (v_unattempted::NUMERIC * v_unattempted_marks)
  )::INT;

  -- Insert attempt with student_name, correct, wrong, unattempted, and score
  INSERT INTO public.test_attempts (
    test_id,
    user_id,
    student_name,
    score,
    correct_answers,
    wrong_answers,
    unattempted,
    total_questions,
    percentile
  )
  VALUES (
    p_test_id,
    v_uid,
    v_final_student_name,
    v_score,
    v_correct_answers,
    v_wrong_answers,
    v_unattempted,
    v_total_questions,
    0
  )
  RETURNING * INTO v_attempt;

  -- Insert individual answer records
  INSERT INTO public.test_attempt_answers (
    attempt_id,
    question_id,
    selected_answer,
    correct_answer,
    is_correct
  )
  SELECT
    v_attempt.id,
    q.id,
    COALESCE(p_answers ->> q.id::text, ''),
    CASE
      WHEN q.question_type = 'integer' THEN COALESCE(q.integer_answer::text, '')
      ELSE COALESCE(q.correct_answer, '')
    END,
    (
      COALESCE(p_answers ->> q.id::text, '') <> ''
      AND (
        CASE
          WHEN q.question_type = 'mcq' THEN q.correct_answer = COALESCE(p_answers ->> q.id::text, '')
          WHEN q.question_type = 'integer' THEN q.integer_answer IS NOT NULL AND COALESCE(p_answers ->> q.id::text, '') = q.integer_answer::text
          ELSE FALSE
        END
      )
    )
  FROM public.test_questions q
  WHERE q.test_id = p_test_id;

  v_leaderboard_batch_id := COALESCE(v_test.batch_id, v_profile.batch_id);

  PERFORM public.recalculate_test_attempt_percentiles(p_test_id, v_leaderboard_batch_id);

  SELECT *
  INTO v_attempt
  FROM public.test_attempts a
  WHERE a.id = v_attempt.id;

  PERFORM public.refresh_admin_analytics();

  SELECT jsonb_build_object(
    'id', aud.id,
    'full_name', aud.full_name,
    'email', aud.email,
    'role', aud.role,
    'approval_status', aud.approval_status,
    'batch_id', aud.batch_id,
    'target_exam', aud.target_exam,
    'class_label', aud.class_label,
    'avatar_seed', aud.avatar_seed,
    'rank', aud.rank,
    'average_score', aud.average_score,
    'streak_days', aud.streak_days
  )
  INTO v_user
  FROM public.admin_user_directory aud
  WHERE aud.id = v_uid;

  IF v_user IS NULL THEN
    SELECT jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'approval_status', p.approval_status,
      'batch_id', p.batch_id,
      'target_exam', p.target_exam,
      'class_label', p.class_label,
      'avatar_seed', p.avatar_seed,
      'rank', 0,
      'average_score', 0,
      'streak_days', 0
    )
    INTO v_user
    FROM public.profiles p
    WHERE p.id = v_uid;
  END IF;

  SELECT jsonb_build_object(
    'id', tas.id,
    'test_id', tas.test_id,
    'user_id', tas.user_id,
    'student_name', tas.student_name,
    'score', tas.score,
    'correct_answers', tas.correct_answers,
    'wrong_answers', tas.wrong_answers,
    'unattempted', tas.unattempted,
    'total_questions', tas.total_questions,
    'rank', tas.rank,
    'percentile', tas.percentile,
    'submitted_at', tas.submitted_at
  )
  INTO v_result
  FROM public.test_attempt_summaries tas
  WHERE tas.id = v_attempt.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', tl.user_id,
      'full_name', tl.full_name,
      'batch_id', tl.batch_id,
      'score', tl.score,
      'percentile', tl.percentile,
      'rank', tl.rank,
      'tests_attempted', tl.tests_attempted
    )
    ORDER BY tl.rank ASC, tl.full_name ASC
  )
  INTO v_leaderboard
  FROM public.get_leaderboard('test_wise', v_leaderboard_batch_id, p_test_id) tl;

  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', lb.user_id,
      'full_name', lb.full_name,
      'batch_id', lb.batch_id,
      'score', lb.score,
      'percentile', lb.percentile,
      'rank', lb.rank,
      'tests_attempted', lb.tests_attempted
    )
    ORDER BY lb.rank ASC, lb.full_name ASC
  )
  INTO v_overall_leaderboard
  FROM public.get_leaderboard('overall_history', v_profile.batch_id, NULL) lb;

  RETURN jsonb_build_object(
    'result', v_result,
    'leaderboard', COALESCE(v_leaderboard, '[]'::jsonb),
    'overall_leaderboard', COALESCE(v_overall_leaderboard, '[]'::jsonb),
    'user', v_user
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_test_attempt(UUID, JSONB, TEXT) TO authenticated;
