-- Migration: Update update_test_details RPC function to accept p_is_open_for_all and allow batchless Open for All tests
-- Date: 2026-08-09

DROP FUNCTION IF EXISTS public.update_test_details(UUID, TEXT, TEXT, INTEGER, TEXT, public.test_type, TEXT, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_test_details(UUID, TEXT, TEXT, INTEGER, TEXT, public.test_type, TEXT, TIMESTAMPTZ, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_test_details(
  p_test_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_duration_minutes INTEGER,
  p_batch_id TEXT,
  p_type public.test_type,
  p_subject TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_scholarship_admission_class TEXT DEFAULT NULL,
  p_scholarship_target_exam TEXT DEFAULT NULL,
  p_is_open_for_all BOOLEAN DEFAULT FALSE
)
RETURNS SETOF public.test_catalog
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.tests;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_type = 'weekly' AND COALESCE(p_is_open_for_all, FALSE) = FALSE AND COALESCE(TRIM(p_batch_id), '') = '' THEN
    RAISE EXCEPTION 'Weekly restricted tests require a batch';
  END IF;

  IF p_type = 'scholarship' AND (COALESCE(TRIM(p_scholarship_admission_class), '') = '' OR COALESCE(TRIM(p_scholarship_target_exam), '') = '') THEN
    RAISE EXCEPTION 'Scholarship tests require admission class and target exam';
  END IF;

  UPDATE public.tests
  SET
    title = p_title,
    description = p_description,
    duration_minutes = p_duration_minutes,
    batch_id = CASE WHEN p_type = 'weekly' THEN NULLIF(TRIM(p_batch_id), '') ELSE NULL END,
    type = p_type,
    subject = p_subject,
    scheduled_at = p_scheduled_at,
    scholarship_admission_class = CASE WHEN p_type = 'scholarship' THEN p_scholarship_admission_class ELSE NULL END,
    scholarship_target_exam = CASE WHEN p_type = 'scholarship' THEN p_scholarship_target_exam ELSE NULL END,
    is_open_for_all = COALESCE(p_is_open_for_all, FALSE)
  WHERE id = p_test_id
    AND deleted_at IS NULL;

  RETURN QUERY
  SELECT *
  FROM public.test_catalog
  WHERE id = p_test_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_test_details(UUID, TEXT, TEXT, INTEGER, TEXT, public.test_type, TEXT, TIMESTAMPTZ, TEXT, TEXT, BOOLEAN) TO authenticated;
