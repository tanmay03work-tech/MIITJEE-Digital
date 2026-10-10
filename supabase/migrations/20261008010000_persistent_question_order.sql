-- Migration: 20261008010000_persistent_question_order.sql
-- Description: Add persistent position column to questions table and provide atomic reordering RPC.

-- 1. Add position column if it does not exist
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS position INTEGER;

-- 2. Backfill existing questions deterministically
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY id ASC) AS pos
  FROM public.questions
)
UPDATE public.questions q
SET position = r.pos
FROM ranked r
WHERE q.id = r.id AND (q.position IS NULL OR q.position = 0);

-- 3. Set NOT NULL and default
ALTER TABLE public.questions ALTER COLUMN position SET DEFAULT 1;
UPDATE public.questions SET position = 1 WHERE position IS NULL;
ALTER TABLE public.questions ALTER COLUMN position SET NOT NULL;

-- 4. Create composite deterministic index
CREATE INDEX IF NOT EXISTS idx_questions_set_position ON public.questions (set_id, position, id);

-- 5. Atomic secure reordering RPC
CREATE OR REPLACE FUNCTION public.reorder_question_set(
  p_set_id BIGINT,
  p_question_ids BIGINT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Question IDs array cannot be empty';
  END IF;

  -- Verify all provided question IDs belong to the specified set_id and no foreign/duplicate IDs exist
  SELECT COUNT(DISTINCT q.id) INTO v_count
  FROM public.questions q
  JOIN unnest(p_question_ids) AS u(id) ON q.id = u.id
  WHERE q.set_id = p_set_id;

  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'Some question IDs do not belong to set % or duplicate IDs were provided', p_set_id;
  END IF;

  -- Atomically update positions
  WITH ordered_items AS (
    SELECT id, ordinality::INT AS new_pos
    FROM unnest(p_question_ids) WITH ORDINALITY AS t(id, ordinality)
  )
  UPDATE public.questions q
  SET position = o.new_pos
  FROM ordered_items o
  WHERE q.id = o.id AND q.set_id = p_set_id;

  RETURN jsonb_build_object(
    'success', true,
    'set_id', p_set_id,
    'updated_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_question_set(BIGINT, BIGINT[]) TO authenticated;
