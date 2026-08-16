-- Phase 1: Exam Link System Migration
-- Add unique shareable exam link attributes to public.tests

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_open_for_all BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_link_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS link_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill share_code for any existing test that does not have one
UPDATE public.tests
SET share_code = UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 8))
WHERE share_code IS NULL;

-- Index for high-performance share_code lookup
CREATE INDEX IF NOT EXISTS idx_tests_share_code ON public.tests (share_code);

-- Function to resolve exam link securely without exposing internal database structures
CREATE OR REPLACE FUNCTION public.resolve_exam_link(
  p_share_code TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_test RECORD;
  v_user_batch TEXT;
  v_user_role TEXT;
  v_is_expired BOOLEAN;
  v_status TEXT;
  v_message TEXT;
BEGIN
  -- Search for test by share_code (case-insensitive)
  SELECT id, title, description, duration_minutes, batch_id, type, subject,
         scheduled_at, is_published, deleted_at, share_code, is_open_for_all,
         is_link_revoked, link_expires_at
  INTO v_test
  FROM public.tests
  WHERE UPPER(share_code) = UPPER(TRIM(p_share_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'INVALID',
      'message', 'Exam link does not exist or is invalid.'
    );
  END IF;

  IF v_test.deleted_at IS NOT NULL OR v_test.is_link_revoked = TRUE OR v_test.is_published = FALSE THEN
    RETURN jsonb_build_object(
      'status', 'REVOKED',
      'message', 'This exam link has been revoked or unpublished by the administrator.'
    );
  END IF;

  v_is_expired := (v_test.link_expires_at IS NOT NULL AND NOW() > v_test.link_expires_at);
  IF v_is_expired THEN
    RETURN jsonb_build_object(
      'status', 'EXPIRED',
      'message', 'This exam link has expired.',
      'link_expires_at', v_test.link_expires_at
    );
  END IF;

  -- Verify user eligibility if user_id is provided
  v_status := 'VALID';
  v_message := 'Exam link resolved successfully.';

  IF p_user_id IS NOT NULL THEN
    SELECT batch_id, role INTO v_user_batch, v_user_role
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_user_role <> 'admin' AND v_test.is_open_for_all = FALSE THEN
      IF v_test.batch_id IS NOT NULL AND (v_user_batch IS NULL OR v_user_batch <> v_test.batch_id) THEN
        v_status := 'BATCH_RESTRICTED';
        v_message := 'This exam is restricted to batch ' || COALESCE(v_test.batch_id, 'assigned batch') || '.';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'message', v_message,
    'test', jsonb_build_object(
      'id', v_test.id,
      'share_code', v_test.share_code,
      'title', v_test.title,
      'description', v_test.description,
      'duration_minutes', v_test.duration_minutes,
      'batch_id', v_test.batch_id,
      'type', v_test.type,
      'subject', v_test.subject,
      'scheduled_at', v_test.scheduled_at,
      'is_open_for_all', v_test.is_open_for_all,
      'is_link_revoked', v_test.is_link_revoked,
      'link_expires_at', v_test.link_expires_at,
      'access_mode', CASE WHEN v_test.is_open_for_all THEN 'OPEN_FOR_ALL' ELSE 'RESTRICTED_BATCH' END
    )
  );
END;
$$;

-- Function for admins to generate or refresh unique exam links
CREATE OR REPLACE FUNCTION public.generate_exam_share_link(
  p_test_id UUID,
  p_is_open_for_all BOOLEAN DEFAULT FALSE,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_code TEXT;
  v_test RECORD;
BEGIN
  v_new_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 8));

  UPDATE public.tests
  SET share_code = COALESCE(share_code, v_new_code),
      is_open_for_all = p_is_open_for_all,
      is_link_revoked = FALSE,
      link_expires_at = p_expires_at
  WHERE id = p_test_id
  RETURNING id, share_code, is_open_for_all, is_link_revoked, link_expires_at INTO v_test;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test with ID % not found.', p_test_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'share_code', v_test.share_code,
    'is_open_for_all', v_test.is_open_for_all,
    'link_expires_at', v_test.link_expires_at
  );
END;
$$;
