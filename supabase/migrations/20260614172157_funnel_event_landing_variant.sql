-- Tag funnel_event rows with the landing A/B arm so the daily digest can split
-- the Visitor→Survey-start funnel into dark vs white.
--
-- Only the server-side `unique_visitor` rows (written by recordUniqueVisit, flagged
-- by proxy.ts) carry it — the prepaid_* events are already white-only by nature.
-- Nullable + additive; legacy rows (variant unknown) are treated as "control"
-- (the original dark experience) by the reporting RPC.

ALTER TABLE funnel_event ADD COLUMN IF NOT EXISTS landing_variant text;
