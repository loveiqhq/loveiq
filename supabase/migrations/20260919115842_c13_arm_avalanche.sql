-- c13_arm(): finish the hash before bucketing on it.
--
-- The previous version took `% 2` of raw FNV-1a. That is not a coin flip: the FNV
-- multiplier is odd, so multiplication never touches the low bit and the whole hash
-- collapses to "does the seed contain an odd number of odd-valued characters?".
-- Verified against production data at the time: the arm matched that parity on 500 of
-- 500 session ids, with no cross-cells.
--
-- Balance was unaffected (that parity is unbiased for a random uuid), so the split
-- itself was valid. What broke was the SALT: flipping it can only invert the parity
-- wholesale, so it re-labels the groups without re-drawing them. Changing the salt
-- moved 0.00% of 200,000 ids. Any future experiment seeded from session_id the same way
-- would have produced the identical split, or its exact complement, and the two could
-- never have been separated afterwards.
--
-- Appending murmur3's fmix32 makes every output bit depend on every input bit. Changing
-- the salt now moves 50.04% of ids.
--
-- SAFE TO CHANGE NOW, AND ONLY NOW: no real visitor has ever been in this experiment.
-- C13 was on production for roughly half an hour on 2026-09-18 and only two submissions
-- carry an arm stamp, both staff probes. Re-bucketing after real exposure would reorder
-- the survey under people mid-flight and invalidate everything collected before it.
--
-- Mirrors `assignQuestionOrderArm` in shared/experiments/questionOrderArm.ts. The two
-- are checked against each other over real session ids; they must be changed together.
CREATE OR REPLACE FUNCTION public.c13_arm(session_id text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
DECLARE
  s TEXT;
  h BIGINT := 2166136261;  -- 0x811c9dc5
  i INT;
BEGIN
  IF session_id IS NULL OR btrim(session_id) = '' THEN
    RETURN 'control';
  END IF;

  s := 'c13-opening-order:' || session_id;

  FOR i IN 1..length(s) LOOP
    h := ((h # ascii(substr(s, i, 1))) * 16777619) % 4294967296;  -- 0x01000193
  END LOOP;

  -- fmix32: h ^= h>>16; h *= 0x85ebca6b; h ^= h>>13; h *= 0xc2b2ae35; h ^= h>>16
  --
  -- The two multiplies go through NUMERIC. h can reach 2^32-1 and 0xc2b2ae35 is
  -- ~3.27e9, so the product reaches ~1.4e19 — past bigint's 9.22e18 ceiling. In
  -- bigint this raises "bigint out of range" rather than wrapping, so it fails loudly
  -- rather than silently, but it fails. The FNV loop above stays in bigint: its
  -- multiplier is only 16777619, so the product peaks around 7.2e16.
  h := h # (h >> 16);
  h := ((h::numeric * 2246822507) % 4294967296)::bigint;
  h := h # (h >> 13);
  h := ((h::numeric * 3266489909) % 4294967296)::bigint;
  h := h # (h >> 16);

  RETURN CASE WHEN h % 2 = 0 THEN 'control' ELSE 'variant' END;
END;
$function$;
