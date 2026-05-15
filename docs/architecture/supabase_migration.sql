-- Migration: Create rate_limits table for persistent rate limiting
-- Run this in your Supabase SQL Editor

-- Create the rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (no public access)
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Create a cleanup function to remove old entries
-- Run this periodically (e.g., daily) to clean up stale rate limit entries
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE updated_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create the atomic rate limit check function (more efficient)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_ms BIGINT,
  p_now BIGINT
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at BIGINT) AS $$
DECLARE
  v_window_start BIGINT;
  v_hits BIGINT[];
  v_valid_hits BIGINT[];
  v_hit_count INTEGER;
BEGIN
  v_window_start := p_now - p_window_ms;

  -- Get existing hits
  SELECT hits INTO v_hits
  FROM rate_limits
  WHERE key = p_key;

  IF v_hits IS NULL THEN
    v_hits := ARRAY[]::BIGINT[];
  END IF;

  -- Filter hits within window
  SELECT ARRAY_AGG(h) INTO v_valid_hits
  FROM UNNEST(v_hits) AS h
  WHERE h > v_window_start;

  IF v_valid_hits IS NULL THEN
    v_valid_hits := ARRAY[]::BIGINT[];
  END IF;

  v_hit_count := CARDINALITY(v_valid_hits);

  -- Check if over limit
  IF v_hit_count >= p_limit THEN
    RETURN QUERY SELECT
      FALSE,
      0,
      (SELECT MIN(h) FROM UNNEST(v_valid_hits) AS h) + p_window_ms;
    RETURN;
  END IF;

  -- Add new hit
  v_valid_hits := ARRAY_APPEND(v_valid_hits, p_now);

  -- Upsert
  INSERT INTO rate_limits (key, hits, updated_at)
  VALUES (p_key, v_valid_hits, TO_TIMESTAMP(p_now / 1000.0))
  ON CONFLICT (key) DO UPDATE SET
    hits = v_valid_hits,
    updated_at = TO_TIMESTAMP(p_now / 1000.0);

  RETURN QUERY SELECT
    TRUE,
    p_limit - CARDINALITY(v_valid_hits),
    p_now + p_window_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_rate_limits() TO service_role;

-- ============================================
-- RLS Policies for waitlist_signups table (3.3)
-- ============================================
-- Run this to secure your waitlist_signups table

-- Enable RLS on waitlist_signups (if not already enabled)
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies that might allow public access
DROP POLICY IF EXISTS "Allow public read" ON waitlist_signups;
DROP POLICY IF EXISTS "Allow public insert" ON waitlist_signups;
DROP POLICY IF EXISTS "Allow anon read" ON waitlist_signups;
DROP POLICY IF EXISTS "Allow anon insert" ON waitlist_signups;

-- Create restrictive policies: ONLY service_role can access
-- This ensures the anon key cannot read or write to this table
CREATE POLICY "Service role can insert" ON waitlist_signups
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can select" ON waitlist_signups
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY "Service role can update" ON waitlist_signups
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

-- No delete policy = no one can delete (even service_role)
-- If you need delete access, add: CREATE POLICY "Service role can delete" ON waitlist_signups FOR DELETE TO service_role USING (true);

-- Verify: Run this query to check policies
-- SELECT * FROM pg_policies WHERE tablename = 'waitlist_signups';
