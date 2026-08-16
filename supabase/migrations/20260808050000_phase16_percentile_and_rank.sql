-- Phase 16: Percentile & Rank Engine Migration
-- Exact percentile formula and tie-breaker ranking RPC

CREATE OR REPLACE FUNCTION public.recalculate_test_leaderboard_ranks(
  p_test_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_takers INT;
BEGIN
  -- Get total test takers for this exam
  SELECT COUNT(*)::int INTO v_total_takers
  FROM public.test_attempts
  WHERE test_id = p_test_id;

  IF v_total_takers IS NULL OR v_total_takers = 0 THEN
    RETURN;
  END IF;

  -- Re-calculate ranks with tie-breaking:
  -- 1. Higher Score DESC
  -- 2. Fewer Wrong Answers ASC
  -- 3. Faster Completion / Earlier Submission ASC
  WITH ranked_attempts AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY score DESC, correct_answers DESC, submitted_at ASC
      ) AS calc_rank,
      COUNT(*) OVER (
        PARTITION BY test_id
      ) AS total_count,
      RANK() OVER (
        ORDER BY score ASC
      ) AS count_below_or_equal
    FROM public.test_attempts
    WHERE test_id = p_test_id
  )
  UPDATE public.test_attempts a
  SET
    rank = r.calc_rank,
    percentile = ROUND((r.count_below_or_equal::numeric / r.total_count::numeric) * 100.0, 2)
  FROM ranked_attempts r
  WHERE a.id = r.id;
END;
$$;
