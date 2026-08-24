/**
 * Renders a SubmissionJourney into Block Kit, for the survey-completion and
 * purchase notifications.
 *
 * Written for a non-technical reader. Every arm goes through labels.ts, so nobody
 * in Slack ever meets a raw value like `white_prev`, and the notification and the
 * /admin dashboard cannot disagree about what an arm is called.
 *
 * Everything interpolated here is escaped. utm_* values arrive on the landing URL
 * and are fully attacker-controlled; a first name is user-supplied too, and the
 * old purchase message interpolated it raw into `*bold*`, so a name containing an
 * asterisk broke the layout.
 */

import { armLabel, AXIS_TITLES, type ExperimentAxis } from "@features/attribution/server/labels";
import type { SubmissionJourney } from "@features/attribution/server/journey";
import { escapeSlack, type SlackBlock } from "@shared/observability/slack";
import {
  codeSpan,
  context,
  fields,
  fitBlocks,
  header,
  linkButton,
  section,
} from "@shared/observability/slack-blocks";

/** ms → "45s" / "12 min" / "1h 4m". Returns null so callers can omit the row entirely. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function money(amount: number | null, currency: string): string | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  return `${currency} ${amount.toFixed(2)}`;
}

/** "Paid — google / cpc / spring", with every user-controllable part escaped. */
function trafficLine(journey: SubmissionJourney): string {
  const { bucket, source, medium, campaign } = journey.traffic;
  const parts = [source, medium, campaign].filter(Boolean).map((p) => escapeSlack(p!));
  return parts.length > 0 ? `${bucket} — ${parts.join(" / ")}` : bucket;
}

/**
 * A one-line progress rail.
 *
 * FILLED means reached. This was INVERTED until 2026-08-24: `:white_circle:`
 * meant done and `:black_circle:` meant not-done, so the solid dot — which every
 * reader takes as "complete" — actually marked the steps that had NOT happened.
 * The message was stating the opposite of the truth in a channel people read to
 * judge how the funnel is doing.
 *
 * A later step proves every earlier one: nobody pays without finishing the
 * survey, opening the report and reaching the paywall. That matters because two
 * of these milestones come from `analytics_event`, which is consent-gated — so
 * without the implication a purchase ping would render "Report opened" hollow and
 * appear to contradict the payment it is announcing.
 */
/**
 * The rail's steps, in order. Exported so the milestone that a caller KNOWS
 * happened can be named rather than passed as a bare index.
 */
export const JOURNEY_STEPS = ["completed", "report_opened", "paywall", "checkout", "paid"] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

/**
 * `reachedFloor` is a step the SERVER witnessed directly, and it wins over the
 * derived milestones.
 *
 * Needed because two of the five milestones come from `analytics_event`, which is
 * consent-gated: a reader who opened their report but declined analytics has a
 * null `reportViewedAt`, so deriving the rail purely from milestones renders the
 * step hollow and — worse — made the live update no-op, because the state never
 * appeared to advance. The route that just wrote `report_session` knows better
 * than the consent gate does.
 */
function journeyRail(journey: SubmissionJourney, reachedFloor?: JourneyStep): string {
  const floorIdx = reachedFloor ? JOURNEY_STEPS.indexOf(reachedFloor) : -1;
  const steps: Array<[string, boolean]> = [
    ["Survey done", Boolean(journey.timings.completedAt)],
    ["Report opened", Boolean(journey.milestones.reportViewedAt)],
    ["Paywall hit", Boolean(journey.milestones.paywallInitiatedAt)],
    ["Checkout", Boolean(journey.milestones.checkoutStartedAt)],
    ["Paid", Boolean(journey.milestones.purchasedAt)],
  ];
  // Walk backwards so the FURTHEST step reached fills in everything before it,
  // rather than only a payment doing so.
  let reached = false;
  const filled: boolean[] = [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    reached = reached || steps[i]![1] || i <= floorIdx;
    filled[i] = reached;
  }
  return steps
    .map(([label], i) => `${filled[i] ? ":large_blue_circle:" : ":white_circle:"} ${label}`)
    .join("  \u2192  ");
}

/** The four arms as a two-column fields block, always all four so absence is visible. */
function armFields(journey: SubmissionJourney): SlackBlock {
  const axes: ExperimentAxis[] = ["landing", "survey", "pricing", "paywall"];
  return fields(
    axes.map((axis) => {
      // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
      const label = armLabel(axis, journey.arms[axis]);
      return {
        // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
        label: AXIS_TITLES[axis],
        value: label.retired ? `${label.short} _(retired arm)_` : label.short,
      };
    })
  );
}

function adminLink(submissionId: number): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/admin/submissions/${submissionId}`;
}

export interface JourneyMessage {
  text: string;
  blocks: SlackBlock[];
  /** True when fitBlocks had to shed detail — worth logging. */
  trimmed: boolean;
  size: number;
}

/**
 * `kind` decides the framing: a completion or a purchase. Both render the same
 * journey and arm blocks underneath, so the two messages stay consistent.
 */
export function buildJourneyMessage(
  journey: SubmissionJourney,
  options:
    | { kind: "survey_completed"; questionCount: number; reachedFloor?: JourneyStep }
    | {
        kind: "purchase";
        planLabel: string;
        archetype: string | null;
        amountText: string | null;
        reachedFloor?: JourneyStep;
      }
): JourneyMessage {
  const name = journey.firstName ? escapeSlack(journey.firstName) : "anonymous";
  const email = journey.emailMasked ? codeSpan(journey.emailMasked) : "no email";
  const surveyTime = formatDuration(journey.timings.durationMs);

  const blocks: SlackBlock[] = [];
  let text: string;

  if (options.kind === "purchase") {
    const amount =
      options.amountText ?? money(journey.money?.amount ?? null, journey.money?.currency ?? "EUR");
    // The fallback text is what lands in the dead-letter table when delivery fails
    // (blocks are NOT dead-lettered), and its first 100 chars are the 60s dedup
    // key — so the submission id and amount go early to keep it both standalone
    // and unique between two same-plan buyers in the same minute.
    text = `:credit_card: Purchase #${journey.submissionId} — ${amount ?? "amount unknown"} — ${escapeSlack(options.planLabel)} — ${name} (${email})`;
    blocks.push(header(`💳 ${amount ?? "Purchase"} — ${options.planLabel}`));
    const archetypeSuffix = options.archetype ? ` · ${escapeSlack(options.archetype)}` : "";
    blocks.push(
      context(`*${name}* (${email}) · submission #${journey.submissionId}${archetypeSuffix}`)
    );
  } else {
    text = `:memo: Survey completed #${journey.submissionId} — ${name} (${email}) — ${options.questionCount} questions${surveyTime ? ` in ${surveyTime}` : ""}`;
    blocks.push(header(`📝 Survey completed — ${journey.firstName ?? "anonymous"}`));
    blocks.push(
      context(
        `*${name}* (${email}) · submission #${journey.submissionId} · ${options.questionCount} questions${surveyTime ? ` in ${surveyTime}` : ""}`
      )
    );
  }

  blocks.push(section(journeyRail(journey, options.reachedFloor)));

  // Where they came from and on what.
  const whereRows: Array<{ label: string; value: string }> = [
    { label: "Came from", value: trafficLine(journey) },
  ];
  if (journey.device) whereRows.push({ label: "Device", value: escapeSlack(journey.device) });
  if (journey.countryTier) {
    // Not IP geolocation — derived from the visitor's own country answer.
    whereRows.push({
      label: "Country tier (self-reported)",
      value: escapeSlack(journey.countryTier),
    });
  }
  if (surveyTime) whereRows.push({ label: "Time on survey", value: surveyTime });

  const toPurchase = formatDuration(journey.timings.msToPurchase);
  if (toPurchase) whereRows.push({ label: "Bought after finishing", value: toPurchase });
  const hesitation = formatDuration(journey.timings.msCheckoutHesitation);
  if (hesitation) whereRows.push({ label: "Time on checkout page", value: hesitation });

  blocks.push(fields(whereRows));
  blocks.push(section("*Experiments they were in*"));
  blocks.push(armFields(journey));

  const link = adminLink(journey.submissionId);
  if (link) blocks.push(linkButton("Open full journey in admin", link));

  const fitted = fitBlocks(blocks, text);
  return { text, blocks: fitted.blocks, trimmed: fitted.trimmed, size: fitted.size };
}
