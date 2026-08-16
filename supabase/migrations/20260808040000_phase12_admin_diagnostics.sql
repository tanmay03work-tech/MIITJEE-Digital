-- Phase 12: Admin System Diagnostics Migration
-- Health check and diagnostic summary RPC

CREATE OR REPLACE FUNCTION public.admin_run_system_diagnostics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_latency_ms INT;
  v_total_users INT;
  v_total_tests INT;
  v_total_questions INT;
  v_total_attempts INT;
  v_pending_drafts INT;
  v_result JSONB;
BEGIN
  v_start_time := clock_timestamp();

  SELECT count(*)::int INTO v_total_users FROM public.profiles;
  SELECT count(*)::int INTO v_total_tests FROM public.tests WHERE deleted_at IS NULL;
  SELECT count(*)::int INTO v_total_questions FROM public.test_questions;
  SELECT count(*)::int INTO v_total_attempts FROM public.test_attempts;
  SELECT count(*)::int INTO v_pending_drafts FROM public.tests WHERE status = 'DRAFT';

  v_latency_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::int;

  v_result := jsonb_build_object(
    'status', 'HEALTHY',
    'db_status', 'OK',
    'db_latency_ms', v_latency_ms,
    'total_users', v_total_users,
    'total_tests', v_total_tests,
    'total_questions', v_total_questions,
    'total_attempts', v_total_attempts,
    'pending_drafts', v_pending_drafts,
    'server_timestamp', now()
  );

  RETURN v_result;
END;
$$;
