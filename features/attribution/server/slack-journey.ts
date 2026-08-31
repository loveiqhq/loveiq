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
import { getPricingBucketsForPlan } from "@features/pricing/logic/reportPricing";
import {
  DEFAULT_REPORT_PURCHASE_PLAN_ID,
  isReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
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

/**
 * Where they came from, with every user-controllable part escaped.
 *
 * Google Ads is asserted from the auto-tagging CLICK ID, not from `utm_source`,
 * which any link can set to "google". Measured over 30 days: 287 of 335
 * submissions carried a click id and only 2 carried a campaign — because
 * auto-tagging appends the click id and nothing else. So an ad click with no
 * campaign says so, instead of printing a bare "Paid — google / cpc" that reads
 * like complete attribution when the campaign is simply not being sent.
 */
function trafficLine(journey: SubmissionJourney): string {
  const { bucket, source, medium, campaign, isGoogleAds, keyword, matchType, network } =
    journey.traffic;
  const esc = (v: string) => escapeSlack(v);

  if (isGoogleAds) {
    const detail: string[] = [];
    if (campaign) detail.push(esc(campaign));
    if (keyword) detail.push(`"${esc(keyword)}"`);
    const qualifiers = [matchType, network].filter(Boolean).map((v) => esc(v!));
    const tail = qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : "";
    if (detail.length === 0) {
      // The gap is named, with its cause, because a missing campaign here is a
      // Google Ads settings problem — not an ad that has no campaign.
      return "Google Ads — campaign not tagged (auto-tagging sends only the click id)";
    }
    return `Google Ads — ${detail.join(" / ")}${tail}`;
  }

  const parts = [source, medium, campaign].filter(Boolean).map((p) => esc(p!));
  return parts.length > 0 ? `${bucket} — ${parts.join(" / ")}` : bucket;
}

/**
 * A one-line progress rail.
 *
 * GREEN means reached, RED means not reached yet — the Formula One convention
 * asked for at the 2026-08-25 strategy meeting, so the rail is readable at a
 * glance without parsing labels.
 *
 * Every step keeps its text label, so colour is never the only channel. That is
 * deliberate: green/red is the worst possible pair for a colourblind reader, and
 * the label is what keeps the rail legible for them.
 *
 * The pairing was INVERTED until 2026-08-24, when this was blue/hollow:
 * `:white_circle:` meant done and `:black_circle:` meant not-done, so the solid
 * dot — which every reader takes as "complete" — actually marked the steps that
 * had NOT happened. The message stated the opposite of the truth in a channel
 * people read to judge how the funnel is doing.
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
    .map(([label], i) => `${filled[i] ? ":large_green_circle:" : ":red_circle:"} ${label}`)
    .join("  \u2192  ");
}

/**
 * The experiments as a two-column fields block.
 *
 * The LIVE axes are always shown, so an arm that failed to record stays visible
 * rather than quietly missing. Concluded axes are not: `paywall` since it was
 * settled in favour of the forced wall, and `survey` since the theme test was
 * settled in favour of white on 2026-08-25. An arm nothing randomises is either a
 * permanent "Not recorded" or a permanent constant, and both are noise on every
 * single message — the class of blank row that made these look broken. The
 * historical value is still stored, and still in the structured log line beside
 * this message; no /admin screen renders it, which is the point of retiring the
 * axis rather than the arm.
 */
function armFields(journey: SubmissionJourney): SlackBlock {
  const axes: ExperimentAxis[] = ["landing"];
  return fields(
    axes.map((axis) => {
      // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
      const label = armLabel(axis, journey.arms[axis]);
      const value = label.retired ? `${label.short} _(retired arm)_` : label.short;
      return {
        // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
        label: AXIS_TITLES[axis],
        value,
      };
    })
  );
}

/**
 * PostHog session-replay deep link.
 *
 * Region and project id are hardcoded, matching how every other vendor identifier
 * in this repo is handled (the GA4 measurement id in app/layout.tsx, the Clarity
 * project id in public/clarity-init.js, the Google Ads tag id): all of them are
 * public, non-secret identifiers that only change if the account moves.
 *
 * NOT derived from `NEXT_PUBLIC_POSTHOG_HOST`. That variable holds the INGESTION
 * host (`eu.i.posthog.com`), which is a different hostname from the app the replay
 * is viewed in (`eu.posthog.com`), and it carries no project id at all — so
 * deriving it would mean a string transform that produces a plausible-looking URL
 * leading nowhere.
 *
 * The id goes in the PATH — `/replay/<id>`. PostHog also accepts it as a query
 * parameter on `/replay/home`, but that form lands on the recordings LIST with a
 * filter applied rather than opening the recording, which reads to whoever clicked
 * it as a broken link.
 */
const POSTHOG_REPLAY_BASE = "https://eu.posthog.com/project/244778/replay";

function recordingLink(sessionId: string | null): string | null {
  if (!sessionId) return null;
  // The id is already constrained to [A-Za-z0-9_-] by the /api/survey schema that
  // accepted it; re-encode anyway so this function is safe on its own terms.
  return `${POSTHOG_REPLAY_BASE}/${encodeURIComponent(sessionId)}`;
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
    /**
     * How many questions and how long, both in the HEADER.
     *
     * These are the two numbers the team scans for, and both were in the wrong
     * place: the question count sat only in the context line — Slack's smallest,
     * greyest text, the least prominent thing in the message — while the time was
     * in the header AND repeated in that same context line. So the more prominent
     * of the two was the duplicated one.
     *
     * A header is plain_text, so it cannot carry bold, but it renders larger than
     * anything else available and larger than a bolded section. Putting both here
     * is the strongest emphasis Block Kit offers, and it lets the context line
     * drop the repetition and go back to being identity only.
     *
     * Both degrade independently: no recorded duration drops just that clause.
     */
    const headerFacts = [
      `${options.questionCount} question${options.questionCount === 1 ? "" : "s"}`,
      surveyTime,
    ].filter(Boolean);
    blocks.push(
      header(
        `📝 Survey completed — ${journey.firstName ?? "anonymous"}${
          headerFacts.length > 0 ? ` · ${headerFacts.join(" · ")}` : ""
        }`
      )
    );
    blocks.push(context(`*${name}* (${email}) · submission #${journey.submissionId}`));
  }

  blocks.push(section(journeyRail(journey, options.reachedFloor)));

  // Where they came from and on what.
  const whereRows: Array<{ label: string; value: string }> = [
    { label: "Came from", value: trafficLine(journey) },
  ];
  if (journey.device) whereRows.push({ label: "Device", value: escapeSlack(journey.device) });
  // The country only — never the pricing band. The band is an internal key
  // ("tier_1"), and showing it was the whole reason this row read as broken to
  // the team. If the country is unknown the row is omitted rather than falling
  // back to the band, because a band is not an answer to "where are they from".
  if (journey.country) {
    whereRows.push({
      label: "Country (self-reported)",
      value: escapeSlack(journey.country),
    });
  }
  const toPurchase = formatDuration(journey.timings.msToPurchase);
  if (toPurchase) whereRows.push({ label: "Bought after finishing", value: toPurchase });
  const hesitation = formatDuration(journey.timings.msCheckoutHesitation);
  if (hesitation) whereRows.push({ label: "Time on checkout page", value: hesitation });

  blocks.push(fields(whereRows));
  blocks.push(section("*Experiments they were in*"));
  blocks.push(armFields(journey));

  /**
   * The session recording, and nothing else.
   *
   * NO ADMIN LINK ON EITHER MESSAGE (removed 2026-08-27, on request). On the survey
   * message it promised a "full journey" that does not exist yet — report-open,
   * paywall, checkout and payment all read from rows written later, which is why the
   * progress rail above shows one green dot and four red — and everything that IS
   * known by then is already in the message, so it was a click to a restatement. On
   * the purchase message the timeline is real, but the same judgement was applied:
   * whoever wants /admin can search a submission id, and a button nobody presses is
   * a button that makes the two that matter harder to find.
   *
   * The recording button is absent rather than disabled when there is no session id,
   * which is the honest rendering: no id means no recording exists to open. That is
   * the normal state for every submission before 2026-08-27 and for anyone whose
   * replay was blocked or sampled out — so a message legitimately carries no buttons
   * at all, and the block is only pushed when there is something to put in it.
   * Slack rejects an actions block with zero elements.
   */
  const replay = recordingLink(journey.recordingSessionId);
  if (replay) blocks.push(linkButton("▶ Watch session recording", replay));

  const fitted = fitBlocks(blocks, text);
  return { text, blocks: fitted.blocks, trimmed: fitted.trimmed, size: fitted.size };
}
