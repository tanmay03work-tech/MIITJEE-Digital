-- Phase 18: Admin Exam Dashboard Migration
-- Admin state control procedure for Start Now, End Now, Archive, Soft Delete, and Publish toggling

CREATE OR REPLACE FUNCTION public.admin_update_exam_state(
  p_test_id UUID,
  p_status TEXT DEFAULT NULL,
  p_is_published BOOLEAN DEFAULT NULL,
  p_force_end BOOLEAN DEFAULT FALSE,
  p_soft_delete BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_soft_delete THEN
    UPDATE public.tests
    SET deleted_at = NOW(),
        status = 'ARCHIVED'
    WHERE id = p_test_id;

    RETURN FOUND;
  END IF;

  IF p_force_end THEN
    -- Mark active sessions as AUTO_SUBMITTED
    UPDATE public.active_exam_sessions
    SET status = 'AUTO_SUBMITTED',
        last_active_at = NOW()
    WHERE test_id = p_test_id AND status = 'IN_PROGRESS';

    UPDATE public.tests
    SET status = 'ENDED',
        is_published = FALSE
    WHERE id = p_test_id;

    RETURN FOUND;
  END IF;

  UPDATE public.tests
  SET status = COALESCE(p_status, status),
      is_published = COALESCE(p_is_published, is_published)
  WHERE id = p_test_id;

  RETURN FOUND;
END;
$$;
