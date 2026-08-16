-- Phase 11: Admin Submission Monitoring Migration
-- Active exam sessions tracking table and admin live control RPCs

CREATE TABLE IF NOT EXISTS public.active_exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'DISCONNECTED', 'WARNING_TRIGGERED')) NOT NULL DEFAULT 'IN_PROGRESS',
  current_question_index INT NOT NULL DEFAULT 0,
  attempted_count INT NOT NULL DEFAULT 0,
  unattempted_count INT NOT NULL DEFAULT 0,
  flagged_count INT NOT NULL DEFAULT 0,
  violations_count INT NOT NULL DEFAULT 0,
  time_extended_minutes INT NOT NULL DEFAULT 0,
  device_info TEXT DEFAULT 'Web',
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT active_exam_sessions_unique_user_test UNIQUE (test_id, user_id)
);

-- Enable RLS
ALTER TABLE public.active_exam_sessions ENABLE ROW LEVEL SECURITY;

-- Students can read/update their own active session
DROP POLICY IF EXISTS active_sessions_student_all ON public.active_exam_sessions;
CREATE POLICY active_sessions_student_all ON public.active_exam_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can read all active sessions
DROP POLICY IF EXISTS active_sessions_admin_read ON public.active_exam_sessions;
CREATE POLICY active_sessions_admin_read ON public.active_exam_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.approval_status = 'approved'
    )
  );

-- RPC: Admin fetch live exam sessions for a test
CREATE OR REPLACE FUNCTION public.admin_get_live_exam_sessions(
  p_test_id UUID
)
RETURNS TABLE (
  session_id UUID,
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
  last_active_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.user_id,
    COALESCE(p.full_name, 'Student') AS student_name,
    p.batch_id,
    s.status,
    s.current_question_index,
    s.attempted_count,
    s.unattempted_count,
    s.flagged_count,
    s.violations_count,
    s.time_extended_minutes,
    s.device_info,
    s.last_active_at
  FROM public.active_exam_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.test_id = p_test_id
  ORDER BY s.last_active_at DESC;
END;
$$;

-- RPC: Admin force submit student exam
CREATE OR REPLACE FUNCTION public.admin_force_submit_session(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.active_exam_sessions
  SET status = 'AUTO_SUBMITTED',
      last_active_at = NOW()
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$$;

-- RPC: Admin extend student time
CREATE OR REPLACE FUNCTION public.admin_extend_session_time(
  p_session_id UUID,
  p_minutes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.active_exam_sessions
  SET time_extended_minutes = time_extended_minutes + p_minutes,
      last_active_at = NOW()
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$$;

-- RPC: Admin reset student warnings
CREATE OR REPLACE FUNCTION public.admin_reset_session_warnings(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.active_exam_sessions
  SET violations_count = 0,
      status = CASE WHEN status = 'WARNING_TRIGGERED' THEN 'IN_PROGRESS' ELSE status END,
      last_active_at = NOW()
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$$;
