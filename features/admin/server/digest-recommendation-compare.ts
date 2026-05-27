/**
 * Recommendation loop-closure comparator.
 *
 * Takes last-N-weeks history + this week's emitted recommendations and
 * classifies each PRIOR recommendation as resolved / ongoing / worsened.
 * The cron then renders the result as a "*Revisited from last week*" Slack
 * section so the strategy lead sees the action → outcome loop close.
 *
 * Pure function. No I/O. The full registry of "which fingerprint metric
 * matters for each rule family" lives here so renaming/adding a rule means
 * touching exactly two files: `digest-recommendations.ts` (the rule) and
 * this file (its improvement direction).
 */

import { ruleFamily, type Recommendation } from "@features/admin/server/digest-recommendations";
import type { HistoricalRecommendation } from "@features/admin/server/digest-recommendation-history";

/** Each rule family declares which numeric fingerprint key tracks its health. */
interface RuleDirection {
  metric: string; // key on the fingerprint JSONB
  /** true = bigger is better; false = smaller is better. */
  betterIsHigher: boolean;
  /** Human-friendly metric label for the delta line. */
  label: string;
  /** "pp" for percentage-point, "%" for percent, "" for raw count, "€" for revenue. */
  unit: "pp" | "%" | "" | "€";
}

const RULE_DIRECTION: Record<string, RuleDirection> = {
  wizard_slide_drop: { metric: "kept_pct", betterIsHigher: true, label: "kept", unit: "pp" },
  dropoff_revenue_loss: {
    metric: "est_lost_revenue",
    betterIsHigher: false,
    label: "lost",
    unit: "€",
  },
  channel_efficiency_low: { metric: "paid_rate", betterIsHigher: true, label: "paid", unit: "%" },
  engagement_bucket_multiplier: {
    metric: "mult",
    betterIsHigher: true,
    label: "mult",
    unit: "",
  },
  answer_lift_positive: { metric: "lift_pct", betterIsHigher: true, label: "lift", unit: "%" },
  answer_lift_negative: {
    // Going from -80% toward 0 IS an increase in lift_pct, so betterIsHigher: true
    // matches the actual numeric direction.
    metric: "lift_pct",
    betterIsHigher: true,
    label: "lift",
    unit: "%",
  },
  chapter_feedback_negative: { metric: "downs", betterIsHigher: false, label: "downs", unit: "" },
};

export interface RevisitedEntry {
  rule: string;
  severity: "high" | "med" | "low";
  lastWeekMessage: string;
  status: "resolved" | "ongoing" | "worsened";
  /** Set when status !== "resolved". */
  currentMessage?: string;
  /** Human-readable delta line, e.g. "65% → 78% (+13pp)" — present when comparable. */
  deltaSummary?: string;
  /** Number of consecutive weeks the rule has fired (>=2 means ongoing). */
  consecutiveWeeks?: number;
}

/**
 * Sort history rows newest-to-oldest by `createdAt`. The first entry per
 * rule key represents "last week's emission" for comparison purposes.
 */
function indexHistoryByRule(
  history: HistoricalRecommendation[]
): Map<string, HistoricalRecommendation[]> {
  const sorted = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byRule = new Map<string, HistoricalRecommendation[]>();
  for (const row of sorted) {
    const existing = byRule.get(row.rule);
    if (existing) {
      existing.push(row);
    } else {
      byRule.set(row.rule, [row]);
    }
  }
  return byRule;
}

/**
 * Walk consecutive prior weeks for a rule (from this week backwards) and
 * count how many distinct week_keys it appeared in. Used to render
 * "3rd consecutive week" tags.
 */
function countConsecutiveWeeks(
  history: HistoricalRecommendation[],
  currentWeekKey: string | null
): number {
  if (history.length === 0) return 0;
  // History is already sorted newest-first by caller.
  const weeks = new Set<string>(history.map((h) => h.weekKey));
  if (currentWeekKey) weeks.add(currentWeekKey);
  // Convert to sorted desc, then walk while weeks are sequential ISO weeks.
  // For simplicity we count distinct weeks in history without checking that
  // they're truly consecutive — close enough for the digest framing, and
  // resilient to a skipped Monday (cron failure).
  return weeks.size;
}

function formatDelta(prev: number, curr: number, unit: RuleDirection["unit"]): string {
  const diff = curr - prev;
  const sign = diff > 0 ? "+" : "";
  switch (unit) {
    case "pp":
      return `${prev}% → ${curr}% (${sign}${diff}pp)`;
    case "%":
      return `${prev}% → ${curr}% (${sign}${diff.toFixed(1)}%)`;
    case "€":
      return `€${prev.toLocaleString()} → €${curr.toLocaleString()} (${sign}€${diff.toLocaleString()})`;
    default:
      return `${prev} → ${curr} (${sign}${diff})`;
  }
}

/**
 * Read a numeric fingerprint value. Returns null when missing, non-numeric,
 * or NaN — caller treats null as "can't compare" and falls back to "ongoing"
 * with no delta line.
 */
function readNumericFingerprint(
  fp: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  if (!fp) return null;
  const raw = fp[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Main entry point. Returns an array of RevisitedEntry sorted with the most
 * informative entries first: worsened > resolved > ongoing (because worsened
 * is the most actionable signal for the strategy lead).
 *
 * `currentWeekKey` is the ISO week the digest is rendering for (e.g.
 * '2026-W22'). Used for consecutive-week math; pass null when unknown.
 */
export function classifyRevisited(
  history: HistoricalRecommendation[],
  currentRecs: Recommendation[],
  currentWeekKey: string | null = null
): RevisitedEntry[] {
  // Drop history rows from the SAME week the digest is rendering for. These
  // exist when an earlier same-Monday cron run already persisted this week's
  // recs (e.g. retry after a transient Slack outage) — without this filter,
  // classifyRevisited would self-compare and report every current rule as
  // "ongoing, delta 0".
  const filteredHistory = currentWeekKey
    ? history.filter((h) => h.weekKey !== currentWeekKey)
    : history;
  if (filteredHistory.length === 0) return [];

  const byRule = indexHistoryByRule(filteredHistory);
  const currentByRule = new Map(currentRecs.map((r) => [r.rule, r]));

  // The single "most recent" history week — anything older is context only.
  // Use filteredHistory (same-week rows already removed) so a same-Monday
  // retry doesn't make `mostRecentWeek` point at this week and skip
  // every comparison.
  const mostRecentWeek = filteredHistory
    .map((h) => h.weekKey)
    .sort((a, b) => b.localeCompare(a))[0];

  const out: RevisitedEntry[] = [];

  // Walk each rule that appeared in the most recent prior week. (Rules that
  // only appeared in older weeks are stale — we report on last week vs now.)
  for (const [rule, rows] of byRule.entries()) {
    const last = rows[0]!;
    if (last.weekKey !== mostRecentWeek) continue; // skip stale

    const family = ruleFamily(rule);
    const direction = RULE_DIRECTION[family];
    const current = currentByRule.get(rule);

    if (!current) {
      // Rule fired last week but not this week → resolved (from rule
      // engine's perspective; the metric may still be borderline).
      out.push({
        rule,
        severity: last.severity,
        lastWeekMessage: last.message,
        status: "resolved",
      });
      continue;
    }

    // Rule still firing this week — ongoing or worsened?
    const entry: RevisitedEntry = {
      rule,
      severity: current.severity,
      lastWeekMessage: last.message,
      currentMessage: current.message,
      status: "ongoing",
      consecutiveWeeks: countConsecutiveWeeks(rows, currentWeekKey),
    };

    if (direction) {
      const prev = readNumericFingerprint(last.fingerprint, direction.metric);
      const curr = readNumericFingerprint(current.fingerprint, direction.metric);
      if (prev !== null && curr !== null) {
        entry.deltaSummary = formatDelta(prev, curr, direction.unit);
        const improvement = direction.betterIsHigher ? curr - prev : prev - curr;
        if (improvement < 0) entry.status = "worsened";
      }
    }

    out.push(entry);
  }

  // Sort: worsened first (most actionable), then resolved, then ongoing.
  const STATUS_RANK: Record<RevisitedEntry["status"], number> = {
    worsened: 3,
    resolved: 2,
    ongoing: 1,
  };
  out.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  return out;
}
