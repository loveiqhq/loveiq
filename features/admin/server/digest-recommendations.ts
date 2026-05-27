/**
 * Rule-based recommendations engine for the weekly funnel-digest Slack
 * supplement. Reads a fully-resolved WeeklyMetrics snapshot and emits an
 * ordered list of action items for the strategy lead.
 *
 * Pure function — no I/O, no external state. Easy to unit-test, easy to
 * gate a noisy rule by deleting one block.
 *
 * Each rule is independent. A rule may emit zero, one, or multiple
 * Recommendations. The final list is sorted high → low severity, then capped
 * at 5 to keep the Slack section short.
 */

import type { WeeklyMetrics } from "@features/admin/server/digest-metrics";

export interface Recommendation {
  severity: "high" | "med" | "low";
  /** Stable rule key — survives wording tweaks, used for grouping/snoozing. */
  rule: string;
  message: string;
  evidence: string;
  /**
   * Structured snapshot of the metric values that triggered this rule. Used
   * by the loop-closure lookback (`digest-recommendation-compare.ts`) to
   * detect resolution vs worsening week-over-week. Each rule defines its own
   * keys; the comparator registry knows how to read them.
   *
   * MUST be JSON-serializable (numbers + strings only) — it's persisted to
   * Supabase as JSONB and parsed by the next week's lookback.
   */
  fingerprint: Record<string, number | string>;
}

/**
 * Maps a fully-qualified rule key (which may include dynamic suffixes like
 * `wizard_slide_drop_4_5` or `channel_efficiency_low_google`) to its stable
 * family key. The family key is what `RULE_DIRECTION` in the compare module
 * uses to decide improvement direction.
 *
 * Returns the input unchanged for rules without dynamic suffixes (e.g.
 * `dropoff_revenue_loss`). Keeping this colocated with the rule definitions
 * means renaming a rule only touches one file.
 */
export function ruleFamily(rule: string): string {
  if (rule.startsWith("wizard_slide_drop_")) return "wizard_slide_drop";
  if (rule.startsWith("channel_efficiency_low_")) return "channel_efficiency_low";
  if (rule.startsWith("chapter_feedback_negative_")) return "chapter_feedback_negative";
  return rule;
}

const SEVERITY_RANK: Record<Recommendation["severity"], number> = {
  high: 3,
  med: 2,
  low: 1,
};

const MAX_RECOMMENDATIONS = 5;

/**
 * Truncate to a max length so a single overlong rule doesn't break Slack's
 * 3000-char section cap. Cuts on word boundary when possible.
 */
function clip(text: string, max = 140): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  return `${lastSpace > max / 2 ? head.slice(0, lastSpace) : head}…`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────

function ruleWizardSlideDrop(w: WeeklyMetrics): Recommendation[] {
  const f = w.wizardFunnel;
  if (!f || f.slide1 < 10) return []; // too small to read into
  const slides = [
    { from: 1, to: 2, fromN: f.slide1, toN: f.slide2 },
    { from: 2, to: 3, fromN: f.slide2, toN: f.slide3 },
    { from: 3, to: 4, fromN: f.slide3, toN: f.slide4 },
    { from: 4, to: 5, fromN: f.slide4, toN: f.slide5 },
    { from: 5, to: 6, fromN: f.slide5, toN: f.reportViewed }, // 6 = report
  ];
  const out: Recommendation[] = [];
  for (const s of slides) {
    if (s.fromN < 5) continue; // suppress small-sample noise
    const kept = s.toN / s.fromN;
    if (kept >= 0.8) continue; // healthy retention
    const severity: Recommendation["severity"] = kept < 0.7 ? "high" : "med";
    const stageLabel = s.to === 6 ? "Report viewed" : `slide ${s.to}`;
    out.push({
      severity,
      rule: `wizard_slide_drop_${s.from}_${s.to}`,
      message: clip(
        `Wizard slide ${s.from} → ${stageLabel} retention ${(kept * 100).toFixed(0)}% — review CTA copy`
      ),
      evidence: `${s.fromN} → ${s.toN}`,
      fingerprint: {
        from_n: s.fromN,
        to_n: s.toN,
        kept_pct: Math.round(kept * 100),
      },
    });
  }
  return out;
}

function ruleAnswerLiftPositive(w: WeeklyMetrics): Recommendation[] {
  const a = w.answerLift;
  if (!a || a.pairs.length === 0 || a.baseline_n < 20) return [];
  // Take strongest positive
  const top = [...a.pairs].filter((p) => p.lift_pct > 0).sort((x, y) => y.lift_pct - x.lift_pct)[0];
  if (!top || top.lift_pct < 100) return [];
  return [
    {
      severity: "med",
      rule: "answer_lift_positive",
      message: clip(
        `${top.q_id} answer "${top.answer}" predicts ${top.rate_pct.toFixed(1)}% paid (+${top.lift_pct}% vs baseline) — surface to acquisition`
      ),
      evidence: `n=${top.n}, paid=${top.paid_n}, baseline=${a.baseline_pct.toFixed(1)}%`,
      fingerprint: {
        q_id: top.q_id,
        answer: top.answer,
        n: top.n,
        paid_n: top.paid_n,
        rate_pct: top.rate_pct,
        lift_pct: top.lift_pct,
      },
    },
  ];
}

function ruleAnswerLiftNegative(w: WeeklyMetrics): Recommendation[] {
  const a = w.answerLift;
  if (!a || a.pairs.length === 0 || a.baseline_n < 20) return [];
  const bottom = [...a.pairs]
    .filter((p) => p.lift_pct < 0)
    .sort((x, y) => x.lift_pct - y.lift_pct)[0];
  if (!bottom || bottom.lift_pct > -50) return [];
  return [
    {
      severity: "low",
      rule: "answer_lift_negative",
      message: clip(
        `${bottom.q_id} answer "${bottom.answer}" only ${bottom.rate_pct.toFixed(1)}% paid (${bottom.lift_pct}% vs baseline) — audit cohort`
      ),
      evidence: `n=${bottom.n}, paid=${bottom.paid_n}, baseline=${a.baseline_pct.toFixed(1)}%`,
      fingerprint: {
        q_id: bottom.q_id,
        answer: bottom.answer,
        n: bottom.n,
        paid_n: bottom.paid_n,
        rate_pct: bottom.rate_pct,
        lift_pct: bottom.lift_pct,
      },
    },
  ];
}

function ruleEngagementMultiplier(w: WeeklyMetrics): Recommendation[] {
  const e = w.engagementLift;
  if (!e || e.buckets.length === 0) return [];
  const totalN = e.buckets.reduce((a, b) => a + b.n, 0);
  const totalPaid = e.buckets.reduce((a, b) => a + b.paid, 0);
  if (totalN < 20 || totalPaid === 0) return [];
  const baselineRate = totalPaid / totalN;
  // Find best bucket
  let best: (typeof e.buckets)[number] | null = null;
  let bestRate = 0;
  for (const b of e.buckets) {
    if (b.n === 0) continue;
    const r = b.paid / b.n;
    if (r > bestRate) {
      bestRate = r;
      best = b;
    }
  }
  if (!best || baselineRate === 0) return [];
  const mult = bestRate / baselineRate;
  if (mult < 5) return [];
  return [
    {
      severity: "med",
      rule: "engagement_bucket_multiplier",
      message: clip(
        `${best.bucket} dwell buys at ${mult.toFixed(1)}× baseline — push longer reading via copy + hero positioning`
      ),
      evidence: `bucket n=${best.n}, paid=${best.paid}, baseline rate=${(baselineRate * 100).toFixed(1)}%`,
      fingerprint: {
        bucket: best.bucket,
        n: best.n,
        paid: best.paid,
        mult: Math.round(mult * 10) / 10,
        baseline_rate: Math.round(baselineRate * 1000) / 1000,
      },
    },
  ];
}

function ruleDropoffRevenueLoss(w: WeeklyMetrics): Recommendation[] {
  if (!w.leakSeverity || w.leakSeverity.length === 0) return [];
  const top = w.leakSeverity[0]!;
  if (top.estLostRevenue < 100) return [];
  return [
    {
      severity: "high",
      rule: "dropoff_revenue_loss",
      message: clip(
        `${top.fromStage} → ${top.toStage} dropping ${top.dropCount} users — estimated ~${Math.round(top.estLostRevenue)} EUR lost this week`
      ),
      evidence: `drop=${top.dropCount}, downstream paid-rate=${(top.downstreamPaidRate * 100).toFixed(1)}%, rev/paid=${top.revenuePerPaid.toFixed(0)}`,
      fingerprint: {
        from_stage: top.fromStage,
        to_stage: top.toStage,
        drop_count: top.dropCount,
        est_lost_revenue: Math.round(top.estLostRevenue),
      },
    },
  ];
}

function ruleChannelEfficiencyLow(w: WeeklyMetrics): Recommendation[] {
  const ch = w.channels;
  if (!ch || ch.channels.length === 0) return [];
  const candidates = ch.channels.filter((c) => c.starts >= 50 && c.paidRate === 0);
  if (candidates.length === 0) return [];
  // Largest-starts UTM source with 0% paid → likely landing/audience mismatch
  const worst = candidates.sort((a, b) => b.starts - a.starts)[0]!;
  return [
    {
      severity: "med",
      rule: `channel_efficiency_low_${worst.source}`,
      message: clip(
        `Source "${worst.source}" delivered ${worst.starts} starts but 0% paid — audit landing/audience`
      ),
      evidence: `starts=${worst.starts}, completionRate=${worst.completionRate.toFixed(0)}%`,
      fingerprint: {
        source: worst.source,
        starts: worst.starts,
        paid_rate: Math.round(worst.paidRate * 100) / 100,
        completion_rate: Math.round(worst.completionRate * 100) / 100,
      },
    },
  ];
}

function ruleChapterFeedbackNegative(w: WeeklyMetrics): Recommendation[] {
  if (!w.worstChapters || w.worstChapters.length === 0) return [];
  const worst = w.worstChapters[0]!;
  if (worst.downs < 3) return [];
  return [
    {
      severity: "med",
      rule: `chapter_feedback_negative_${worst.sectionId}`,
      message: clip(`Chapter "${worst.sectionId}" has ${worst.downs} 👎 — review copy`),
      evidence: `downs=${worst.downs}`,
      fingerprint: {
        section_id: worst.sectionId,
        downs: worst.downs,
      },
    },
  ];
}

const RULES: Array<(w: WeeklyMetrics) => Recommendation[]> = [
  ruleWizardSlideDrop,
  ruleAnswerLiftPositive,
  ruleAnswerLiftNegative,
  ruleEngagementMultiplier,
  ruleDropoffRevenueLoss,
  ruleChannelEfficiencyLow,
  ruleChapterFeedbackNegative,
];

/**
 * Run every rule, flatten, sort by severity, cap at 5. Pure function.
 * Returns [] when no rules fire — the digest section is omitted entirely
 * in that case (avoids the "Recommendations: (none)" antipattern).
 */
export function buildRecommendations(w: WeeklyMetrics): Recommendation[] {
  const all: Recommendation[] = [];
  for (const rule of RULES) {
    try {
      all.push(...rule(w));
    } catch {
      // A buggy rule must never crash the digest. Swallow silently — the
      // worst case is one fewer recommendation in the message.
    }
  }
  // Stable sort: severity desc, then keep insertion order within same severity
  // so the rule definition order in RULES[] is the tie-breaker.
  all.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return all.slice(0, MAX_RECOMMENDATIONS);
}
