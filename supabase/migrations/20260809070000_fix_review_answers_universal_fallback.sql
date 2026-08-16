-- Migration: Fix review_answers RPC to support universal fallback from test_attempts.answers JSONB
-- Date: 2026-08-09

CREATE OR REPLACE FUNCTION public.review_answers(p_attempt_id UUID)
RETURNS TABLE (
  question_id UUID,
  test_id UUID,
  question_type TEXT,
  prompt TEXT,
  options TEXT[],
  user_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  explanation TEXT,
  image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.test_attempts;
BEGIN
  -- 1. Fetch the target attempt
  SELECT * INTO v_attempt
  FROM public.test_attempts
  WHERE id = p_attempt_id
    AND (user_id = auth.uid() OR public.is_admin());

  IF v_attempt.id IS NULL THEN
    RETURN;
  END IF;

  -- 2. First check archived_test_question_reviews
  IF EXISTS (
    SELECT 1 FROM public.archived_test_question_reviews
    WHERE attempt_id = p_attempt_id
  ) THEN
    RETURN QUERY
    SELECT
      NULL::UUID AS question_id,
      ar.test_id,
      ar.question_type,
      ar.prompt,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(ar.options)), ARRAY[]::TEXT[]) AS options,
      ar.user_answer,
      ar.correct_answer,
      ar.is_correct,
      ar.explanation,
      ar.image_url
    FROM public.archived_test_question_reviews ar
    WHERE ar.attempt_id = p_attempt_id
    ORDER BY ar.position ASC;
    RETURN;
  END IF;

  -- 3. Next check test_attempt_answers table if populated
  IF EXISTS (
    SELECT 1 FROM public.test_attempt_answers
    WHERE attempt_id = p_attempt_id
  ) THEN
    RETURN QUERY
    SELECT
      q.id AS question_id,
      q.test_id,
      q.question_type::TEXT,
      q.prompt,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(q.options)), ARRAY[]::TEXT[]) AS options,
      taa.selected_answer AS user_answer,
      taa.correct_answer,
      taa.is_correct,
      q.explanation,
      q.image_url
    FROM public.test_attempt_answers taa
    JOIN public.test_questions q ON q.id = taa.question_id
    WHERE taa.attempt_id = p_attempt_id
    ORDER BY q.position ASC;
    RETURN;
  END IF;

  -- 4. Universal Fallback: Join test_questions directly with v_attempt.answers (JSONB)
  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.test_id,
    q.question_type::TEXT,
    q.prompt,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(q.options)), ARRAY[]::TEXT[]) AS options,
    COALESCE(v_attempt.answers ->> q.id::TEXT, '') AS user_answer,
    COALESCE(q.correct_answer, '') AS correct_answer,
    (NULLIF(TRIM(COALESCE(v_attempt.answers ->> q.id::TEXT, '')), '') IS NOT NULL AND LOWER(TRIM(COALESCE(v_attempt.answers ->> q.id::TEXT, ''))) = LOWER(TRIM(COALESCE(q.correct_answer, '')))) AS is_correct,
    q.explanation,
    q.image_url
  FROM public.test_questions q
  WHERE q.test_id = v_attempt.test_id
  ORDER BY q.position ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_answers(UUID) TO authenticated;
