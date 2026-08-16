-- Fix Exam Link Resolution & Automatic Share Code Generation for Present and Future Exams

-- 1. Ensure share_code column exists on public.tests
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_open_for_all BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_link_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS link_expires_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Backfill share_code for all existing tests using 8-character ID prefix
UPDATE public.tests
SET share_code = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE share_code IS NULL;

-- 3. Create trigger function to ensure all future created tests auto-assign share_code
CREATE OR REPLACE FUNCTION public.auto_assign_test_share_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.share_code IS NULL OR TRIM(NEW.share_code) = '' THEN
    IF NEW.id IS NOT NULL THEN
      NEW.share_code := UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8));
    ELSE
      NEW.share_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_test_share_code ON public.tests;
CREATE TRIGGER trg_auto_assign_test_share_code
BEFORE INSERT ON public.tests
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_test_share_code();

-- 4. Updated resolve_exam_link RPC supporting share_code, test ID prefix, and full UUID
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
  v_clean_code TEXT;
BEGIN
  v_clean_code := UPPER(TRIM(p_share_code));

  -- Search for test by share_code, 8-char test ID prefix, or exact ID
  SELECT id, title, description, duration_minutes, batch_id, type, subject,
         scheduled_at, is_published, deleted_at, share_code, is_open_for_all,
         is_link_revoked, link_expires_at
  INTO v_test
  FROM public.tests
  WHERE UPPER(share_code) = v_clean_code
     OR UPPER(REPLACE(id::text, '-', '')) LIKE (v_clean_code || '%')
     OR UPPER(id::text) = v_clean_code;

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
      'share_code', COALESCE(v_test.share_code, UPPER(SUBSTRING(REPLACE(v_test.id::text, '-', '') FROM 1 FOR 8))),
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

-- 5. Updated generate_exam_share_link RPC
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
  v_new_code := UPPER(SUBSTRING(REPLACE(p_test_id::text, '-', '') FROM 1 FOR 8));

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

-- 6. Ensure public.test_catalog view exposes share_code, is_open_for_all, is_link_revoked, link_expires_at
CREATE OR REPLACE VIEW public.test_catalog
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.title,
  t.description,
  t.duration_minutes,
  t.batch_id,
  t.type,
  t.subject,
  t.scheduled_at,
  t.is_published,
  t.scholarship_admission_class,
  t.scholarship_target_exam,
  COUNT(q.id)::int AS question_count,
  t.is_started,
  t.started_at,
  t.share_code,
  t.is_open_for_all,
  t.is_link_revoked,
  t.link_expires_at
FROM public.tests t
LEFT JOIN public.test_questions q ON q.test_id = t.id
WHERE t.is_published = true
  AND t.deleted_at IS NULL
GROUP BY t.id;
