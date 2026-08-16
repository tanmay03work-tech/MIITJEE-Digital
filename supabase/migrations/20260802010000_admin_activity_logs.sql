-- Migration: 20260802_admin_activity_logs.sql
-- Description: Adds a single admin_activity_logs table for production-grade
--   operational logging visible in the in-app Admin Panel.
--   Covers auth events, exam lifecycle, and admin mutations.

-- ─────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_name  TEXT,
  category      TEXT NOT NULL CHECK (category IN ('auth', 'exam', 'admin_action')),
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'info' CHECK (status IN ('success', 'failed', 'warning', 'info')),
  device_info   TEXT,
  details       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.admin_activity_logs IS 'Production activity logs for the in-app Admin Panel. Only meaningful events are logged — no answer clicks, timer ticks, or API traces.';

-- ─────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read all rows
DROP POLICY IF EXISTS activity_logs_admin_read ON public.admin_activity_logs;
CREATE POLICY activity_logs_admin_read ON public.admin_activity_logs
  FOR SELECT USING (public.is_admin());

-- Any authenticated user can INSERT (the app writes logs for any user).
-- We rely on the app to only insert valid data; RLS guards reads.
DROP POLICY IF EXISTS activity_logs_authenticated_insert ON public.admin_activity_logs;
CREATE POLICY activity_logs_authenticated_insert ON public.admin_activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_logs_category_created
  ON public.admin_activity_logs (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
  ON public.admin_activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type
  ON public.admin_activity_logs (event_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. Batch Insert RPC
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_activity_logs(p_logs JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_activity_logs (
    user_id, student_name, category, event_type, status, device_info, details, created_at
  )
  SELECT
    (entry->>'user_id')::UUID,
    entry->>'student_name',
    entry->>'category',
    entry->>'event_type',
    COALESCE(entry->>'status', 'info'),
    entry->>'device_info',
    CASE WHEN entry->'details' IS NOT NULL AND entry->>'details' != 'null'
         THEN (entry->'details')::JSONB ELSE NULL END,
    COALESCE((entry->>'created_at')::TIMESTAMPTZ, timezone('utc', now()))
  FROM jsonb_array_elements(p_logs) AS entry;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. Fetch RPC (paginated, filtered)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fetch_activity_logs(
  p_category  TEXT DEFAULT NULL,
  p_user_id   UUID DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_status    TEXT DEFAULT NULL,
  p_limit     INT DEFAULT 50,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  user_id       UUID,
  student_name  TEXT,
  category      TEXT,
  event_type    TEXT,
  status        TEXT,
  device_info   TEXT,
  details       JSONB,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can fetch
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.user_id, l.student_name, l.category, l.event_type,
    l.status, l.device_info, l.details, l.created_at
  FROM public.admin_activity_logs l
  WHERE
    (p_category IS NULL OR l.category = p_category) AND
    (p_user_id IS NULL OR l.user_id = p_user_id) AND
    (p_event_type IS NULL OR l.event_type = p_event_type) AND
    (p_status IS NULL OR l.status = p_status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
END;
$$;
