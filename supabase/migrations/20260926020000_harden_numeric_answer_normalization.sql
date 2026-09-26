-- Make server-side numeric marking tolerant of formatting copied from other apps.
CREATE OR REPLACE FUNCTION public.normalized_numeric_answer(p_value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(trim(coalesce(p_value, '')), chr(8722), '-'),
              chr(8211),
              '-'
            ),
            chr(8212),
            '-'
          ),
          chr(160),
          ''
        ),
        chr(8239),
        ''
      ),
      ',',
      '.'
    ),
    '[[:space:]]+',
    '',
    'g'
  );

  IF v_normalized !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' THEN
    RETURN NULL;
  END IF;

  RETURN v_normalized::NUMERIC;
END;
$$;
