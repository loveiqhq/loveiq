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
  SECTION_BUDGET,
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
/**
 * Split rather than flat, because the compact layout bolds only the SOURCE —
 * "*Google Ads* — performance_max (x)" — and rebuilding that from a finished
 * string would mean splitting on an em dash that also appears inside campaign
 * names. `head` is a classification we produce ("Google Ads", "Paid",
 * "Direct"); `detail` is assembled from utm values and is already escaped.
 */
function trafficParts(journey: SubmissionJourney): { head: string; detail: string | null } {
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
      return {
        head: "Google Ads",
        detail: "campaign not tagged (auto-tagging sends only the click id)",
      };
    }
    return { head: "Google Ads", detail: `${detail.join(" / ")}${tail}` };
  }

  const parts = [source, medium, campaign].filter(Boolean).map((p) => esc(p!));
  return { head: bucket, detail: parts.length > 0 ? parts.join(" / ") : null };
}

/**
 * The flat form — still what the purchase message renders.
 *
 * Same `|| "Not recorded"` as the compact layout: `classifyTraffic` assigns a
 * bucket on every branch so this is unreachable from real data, but the two
 * branches of one builder should not disagree about what a malformed journey
 * looks like. Without it the purchase message rendered a literal "undefined".
 */
function trafficLine(journey: SubmissionJourney): string {
  const { head, detail } = trafficParts(journey);
  const label = head || "Not recorded";
  return detail ? `${label} — ${detail}` : label;
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
 * "5+ min", or an em dash when nothing recorded it.
 *
 * The plus sign is load-bearing. The value is a FLOOR taken from the furthest
 * `report_engagement_*` milestone crossed, so a reader who stayed eleven minutes
 * and one who stayed fifty both read "10+ min". Printing a bare "10 min" would
 * state a duration we have not measured.
 *
 * An em dash — not "0 min", and not "< 1 min" — when the floor is null. Those
 * milestones sit behind the analytics consent gate, and `report_viewed` alone
 * already misses ~44% of real opens (96 of 216 over 2026-08-25 → 09-05), so absence genuinely means "not recorded".
 * Rendering it as a short visit would put a number in a channel people read to
 * judge the funnel that is wrong in the most flattering-to-nobody direction.
 */
function formatReportDwell(ms: number | null | undefined): string {
  // Guarded the same way formatDuration is, not just against null: a journey
  // assembled by any path that predates this field arrives with `undefined`
  // here, and `Math.round(undefined / 60_000)` is NaN — which renders as a
  // confident "NaN+ min" rather than failing. Non-finite and non-positive are
  // folded into the same honest answer.
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  return `${Math.round(ms / 60_000)}+ min`;
}

/**
 * Bold the arm's NAME and leave its parenthetical description plain, so
 * "Landing Page V1 (First Design)" renders as "*Landing Page V1* (First
 * Design)" — the emphasis Marcus drew.
 *
 * Safe to split on " (" because these strings are a curated constant table in
 * labels.ts, never user input; that is also why they are not escaped here, which
 * matches how the fields version has always rendered them.
 */
function boldArmName(short: string): string {
  const idx = short.indexOf(" (");
  return idx === -1 ? `*${short}*` : `*${short.slice(0, idx)}*${short.slice(idx)}`;
}

/**
 * The compact incoming-survey layout, as ONE section.
 *
 * Requested by Marcus in #all-loveiq on 2026-09-11 ("a bit more compact like
 * this") and reproduced line for line, including the order — landing arm above
 * country, rail last.
 *
 * One section rather than the previous header + context + section + fields +
 * section + fields stack, because the height came from the container, not the
 * content: Slack puts vertical space between every block, and a `fields` grid
 * additionally puts each label on its own line above its value and reflows into
 * two ragged columns. That is why "Came from" and its value were never on the
 * same line. Newlines inside a single section render tight, which is the whole
 * request.
 *
 * What this deliberately DROPS, all of it visible in the mock as an absence:
 * the first name, the masked email and the question count. The submission number
 * is promoted into the title in their place and still identifies the row for
 * anyone who needs to look it up. The name and email are one line to restore if
 * the channel misses them; the question count survives in the notification text.
 */
function compactSurveyLines(journey: SubmissionJourney, reachedFloor?: JourneyStep): string[] {
  const bold = (v: string) => `*${v}*`;
  const lines: string[] = [`Survey submission ${bold(`#${journey.submissionId}`)}`];

  /**
   * Both times on one line, and both sides ALWAYS render.
   *
   * An em dash for whichever is unknown rather than dropping the clause: these
   * messages are read as a vertical column in a channel, and a line that changes
   * shape per message is harder to scan than one with a visible gap. At post
   * time the report has not been opened yet, so "Report time: —" is the normal
   * first state — it fills itself in when the message is edited on a later
   * milestone.
   */
  lines.push(
    `Survey time: ${bold(formatDuration(journey.timings.durationMs) ?? "—")}` +
      `  |  Report time: ${bold(formatReportDwell(journey.timings.reportDwellFloorMs))}`
  );

  const traffic = trafficParts(journey);
  /**
   * `|| "Not recorded"` because this line is the one place a malformed journey
   * can take the whole message down. `classifyTraffic` assigns a bucket on every
   * branch, so the fallback is unreachable in production — but the previous
   * layout passed the bucket through untouched and rendered a literal
   * "undefined", where escaping it throws instead. A notification builder should
   * never be the thing that throws: the survey route builds this message inside
   * a fire-and-forget task, and the backfill cron turns any throw into a 500
   * that abandons the rest of the run.
   */
  lines.push(
    `Came from: ${bold(escapeSlack(traffic.head || "Not recorded"))}` +
      `${traffic.detail ? ` — ${traffic.detail}` : ""}`
  );

  if (journey.device) lines.push(`Device: ${bold(escapeSlack(journey.device))}`);

  // Kept even when unrecorded, which is the rule the fields version followed: a
  // live arm that failed to stamp stays visible rather than quietly missing.
  const landing = armLabel("landing", journey.arms.landing);
  lines.push(
    `Landing page design: ${boldArmName(landing.short)}${landing.retired ? " _(retired arm)_" : ""}`
  );

  // Omitted when unknown rather than falling back to the pricing band — a band
  // is not an answer to "where are they from".
  if (journey.country) {
    lines.push(`Country (self-reported): ${bold(escapeSlack(journey.country))}`);
  }

  /**
   * The rail goes last, and `clampBlock` truncates a section from the END at
   * `SECTION_BUDGET`. So in a one-section layout an oversized line ABOVE the rail
   * does not shorten itself — it pushes the single most important line in the
   * message off the end, silently. The old `fields` layout could not do this:
   * each field was clamped independently and the rail was its own block.
   *
   * Every value above is bounded today (utm at 100 by `classifyTraffic`, country
   * at 100 by `buildSubmissionJourney`, device a closed set, the arm a constant
   * table). This makes that structural rather than a property four separate call
   * sites have to keep true: the facts give, the rail never does.
   */
  const rail = journeyRail(journey, reachedFloor);
  const factsBudget = SECTION_BUDGET - rail.length - 2;
  const facts = lines.join("\n");
  return [facts.length > factsBudget ? `${facts.slice(0, factsBudget - 1)}\u2026` : facts, rail];
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
    /**
     * The purchase message keeps the fields layout, deliberately.
     *
     * Only the incoming-survey hook was asked to be compacted, and the two are
     * not the same job: a purchase is rare, read once, and carries money rows
     * the survey ping has no equivalent for. Compacting it as a side effect
     * would be an unrequested change to the one notification where height
     * costs nothing.
     */
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
  } else {
    /**
     * The notification text, which is NOT the message.
     *
     * It is what a phone shows on the lock screen, what lands in the dead-letter
     * table when delivery fails (blocks are not dead-lettered), and its first 100
     * characters are the 60-second dedup key. So the submission id goes first —
     * it is the only field guaranteed unique between two people finishing within
     * the same minute.
     *
     * The question count lives on here rather than being lost with the header:
     * it is genuinely useful (57 vs 58 after the survey work order) and costs
     * nothing in a line nobody reads in-channel.
     */
    text = `:memo: Survey submission #${journey.submissionId} — ${options.questionCount} question${options.questionCount === 1 ? "" : "s"}${surveyTime ? ` in ${surveyTime}` : ""}`;
    blocks.push(section(compactSurveyLines(journey, options.reachedFloor).join("\n")));
  }

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
