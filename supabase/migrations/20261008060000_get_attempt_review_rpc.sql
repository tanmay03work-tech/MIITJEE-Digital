-- Migration: 20261008060000_get_attempt_review_rpc.sql
-- Description: Implement dedicated, canonical secure get_attempt_review RPC with strict post-submission authorization.

DROP FUNCTION IF EXISTS public.get_attempt_review(UUID);

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id UUID)
RETURNS TABLE (
  question_id UUID,
  test_id UUID,
  question_type TEXT,
  prompt TEXT,
  options TEXT[],
  user_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  is_unattempted BOOLEAN,
  explanation TEXT,
  image_url TEXT,
  subject TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.test_attempts;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin();

  -- 1. Fetch target attempt
  SELECT * INTO v_attempt
  FROM public.test_attempts
  WHERE id = p_attempt_id;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Test attempt not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Authorization check: must be owner or admin
  IF v_attempt.user_id <> v_caller_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied to this attempt review' USING ERRCODE = '42501';
  END IF;

  -- 3. Authorization check: attempt must be finalized (submitted_at is NOT null)
  IF v_attempt.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Attempt is still in progress; review answers are locked until submission' USING ERRCODE = '42501';
  END IF;

  -- 4. Check archived_test_question_reviews first
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
      CASE WHEN (ar.user_answer IS NULL OR TRIM(ar.user_answer) = '') THEN FALSE ELSE ar.is_correct END AS is_correct,
      (ar.user_answer IS NULL OR TRIM(ar.user_answer) = '') AS is_unattempted,
      ar.explanation,
      ar.image_url,
      COALESCE(NULLIF(TRIM(ar.subject_label), ''), 'Physics') AS subject
    FROM public.archived_test_question_reviews ar
    WHERE ar.attempt_id = p_attempt_id
    ORDER BY ar.position ASC;
    RETURN;
  END IF;

  -- 5. Next check test_attempt_answers table if populated
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
      CASE WHEN (taa.selected_answer IS NULL OR TRIM(taa.selected_answer) = '') THEN FALSE ELSE taa.is_correct END AS is_correct,
      (taa.selected_answer IS NULL OR TRIM(taa.selected_answer) = '') AS is_unattempted,
      q.explanation,
      q.image_url,
      COALESCE(NULLIF(TRIM(q.subject_label), ''), 'Physics') AS subject
    FROM public.test_attempt_answers taa
    JOIN public.test_questions q ON q.id = taa.question_id
    WHERE taa.attempt_id = p_attempt_id
    ORDER BY q.position ASC;
    RETURN;
  END IF;

  -- 6. Canonical Fallback: Join test_questions directly with v_attempt.answers (JSONB)
  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.test_id,
    q.question_type::TEXT,
    q.prompt,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(q.options)), ARRAY[]::TEXT[]) AS options,
    COALESCE(v_attempt.answers ->> q.id::TEXT, '') AS user_answer,
    COALESCE(q.correct_answer, '') AS correct_answer,
    (
      NULLIF(TRIM(COALESCE(v_attempt.answers ->> q.id::TEXT, '')), '') IS NOT NULL
      AND LOWER(TRIM(COALESCE(v_attempt.answers ->> q.id::TEXT, ''))) = LOWER(TRIM(COALESCE(q.correct_answer, '')))
    ) AS is_correct,
    (
      v_attempt.answers ->> q.id::TEXT IS NULL
      OR TRIM(COALESCE(v_attempt.answers ->> q.id::TEXT, '')) = ''
    ) AS is_unattempted,
    q.explanation,
    q.image_url,
    COALESCE(NULLIF(TRIM(q.subject_label), ''), 'Physics') AS subject
  FROM public.test_questions q
  WHERE q.test_id = v_attempt.test_id
  ORDER BY q.position ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attempt_review(UUID) TO authenticated;

-- Also update legacy review_answers function to forward to get_attempt_review
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
  is_unattempted BOOLEAN,
  explanation TEXT,
  image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.question_id,
    r.test_id,
    r.question_type,
    r.prompt,
    r.options,
    r.user_answer,
    r.correct_answer,
    r.is_correct,
    r.is_unattempted,
    r.explanation,
    r.image_url
  FROM public.get_attempt_review(p_attempt_id) r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_answers(UUID) TO authenticated;
