-- Migration: 20260801_cbt_windows_architecture.sql
-- Description: Adds tables for CBT Windows application, device binding, local-first queue snapshots, sessions, and audit logging.

-- 1. Student Registered Hardware Devices
CREATE TABLE IF NOT EXISTS public.student_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL UNIQUE,
    device_name TEXT,
    os_version TEXT,
    is_active BOOLEAN DEFAULT true,
    registered_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    last_used_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- 2. CBT Active Exam Sessions
CREATE TABLE IF NOT EXISTS public.cbt_exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    status TEXT DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'LOCKED', 'SUBMITTED', 'FORCE_SUBMITTED'
    start_time TIMESTAMPTZ DEFAULT timezone('utc', now()),
    duration_minutes INT NOT NULL,
    extra_time_minutes INT DEFAULT 0,
    time_remaining_seconds INT NOT NULL,
    last_synced_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    is_unlocked_by_admin BOOLEAN DEFAULT true,
    UNIQUE(user_id, test_id)
);

-- 3. CBT Answer Snapshots & Deltas
CREATE TABLE IF NOT EXISTS public.cbt_answer_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cbt_exam_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    snapshot_type TEXT NOT NULL, -- 'DELTA_10S', 'PERIODIC_30S', 'MILESTONE', 'FINAL_SUBMIT'
    answers_json JSONB NOT NULL,
    version_id INT NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- 4. CBT Security Audit Logs
CREATE TABLE IF NOT EXISTS public.cbt_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.cbt_exam_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'ALT_TAB_ATTEMPT', 'FOCUS_LOSS', 'NETWORK_DISCONNECT', 'TIME_DRIFT', 'DEVICE_BIND'
    details_json JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- RLS & Security
ALTER TABLE public.student_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_answer_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for student_devices
DROP POLICY IF EXISTS student_devices_self_read ON public.student_devices;
CREATE POLICY student_devices_self_read ON public.student_devices
    FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS student_devices_admin_all ON public.student_devices;
CREATE POLICY student_devices_admin_all ON public.student_devices
    FOR ALL USING (public.is_admin());

-- Policies for cbt_exam_sessions
DROP POLICY IF EXISTS cbt_sessions_self_read ON public.cbt_exam_sessions;
CREATE POLICY cbt_sessions_self_read ON public.cbt_exam_sessions
    FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS cbt_sessions_admin_all ON public.cbt_exam_sessions;
CREATE POLICY cbt_sessions_admin_all ON public.cbt_exam_sessions
    FOR ALL USING (public.is_admin());

-- Policies for cbt_answer_snapshots
DROP POLICY IF EXISTS cbt_snapshots_self_read ON public.cbt_answer_snapshots;
CREATE POLICY cbt_snapshots_self_read ON public.cbt_answer_snapshots
    FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS cbt_snapshots_admin_all ON public.cbt_answer_snapshots;
CREATE POLICY cbt_snapshots_admin_all ON public.cbt_answer_snapshots
    FOR ALL USING (public.is_admin());

-- Policies for cbt_audit_logs
DROP POLICY IF EXISTS cbt_logs_self_read ON public.cbt_audit_logs;
CREATE POLICY cbt_logs_self_read ON public.cbt_audit_logs
    FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS cbt_logs_admin_all ON public.cbt_audit_logs;
CREATE POLICY cbt_logs_admin_all ON public.cbt_audit_logs
    FOR ALL USING (public.is_admin());

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_student_devices_fingerprint ON public.student_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_cbt_sessions_user_test ON public.cbt_exam_sessions(user_id, test_id);
CREATE INDEX IF NOT EXISTS idx_cbt_snapshots_session_version ON public.cbt_answer_snapshots(session_id, version_id DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_audit_logs_user ON public.cbt_audit_logs(user_id, created_at DESC);
