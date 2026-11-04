/**
 * The landing page of AP-Analytics (Marcus's "Landing page & assessment page" artboard, as
 * updated on 16 Oct 2026): six headline figures against the period before, every landing test
 * arm by arm from our own visit log and the people each arm brought, and each version's
 * engagement from PostHog, the presenter video's step by step. For Assessment A the landing
 * page is its assessment page.
 */
import { addDays } from "./days";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import {
  classifySource,
  PAY_TO_START_FROM,
  PRE_ON_SALE_FROM,
  PRE_PLANS,
  preBuysOf,
  type Facts,
} from "./facts";
import { comparisonRange, rangeLabel, trendBuckets, type ApFilters } from "./filters";
import {
  ageMatched,
  armStartsComplete,
  comparableStarts,
  ratio,
  sameAge,
  startsComplete,
  subsIn,
  totals,
  type Scope,
} from "./metrics";
import { freePreBlocked, head, type PageHead, type Tile } from "./common";
import { SURVEY_STARTED_FROM, type PtsPayload } from "./pay-to-start";
import {
  POSTHOG_FROM,
  type HeroVideo,
  type LandingArmEngagement,
  type LandingTime,
  type PostHogResult,
} from "./posthog";

export interface LandingTest {
  key: string;
  /**
   * The one name every line uses (both tables, the Traffic page's landing rows), with the
   * registry number, as the design's "#6 · Landing hero".
   */
  name: string;
  /** The compare tab's few characters, as the design's "LP-07". */
  code: string;
  from: string;
  /** Last day, or null while it runs. */
  to: string | null;
  /** The arm that was kept, once ended. */
  winner?: string;
  outcome: string;
  note?: string;
  /** A, then B. */
  arms: [string, string];
}

/**
 * The landing tests this page shows, newest first (shared/experiments/landingVariant.ts), named
 * as the design names them (Traffic board: "#6 · Landing hero"). The rebuild test (V1 vs V2,
 * Aug–Sep 2026) was taken off the page on the 21 Oct 2026 call.
 */
export const LANDING_TESTS: LandingTest[] = [
  {
    key: "hero",
    name: "#6 · Landing hero",
    code: "#6",
    from: LANDING_TEST_START_DAY,
    to: null,
    outcome: "Running (test #6 in the registry), read over up to 28 days.",
    arms: ["white_card", "white_video"],
  },
  {
    key: "hero-first-run",
    name: "#6 · Landing hero · first run (7–13 Oct)",
    code: "#6 · run 1",
    from: LANDING_HERO_VIDEO_LAUNCH_DAY,
    to: addDays(LANDING_TEST_START_DAY, -1),
    outcome: `Run again from ${rangeLabel(LANDING_TEST_START_DAY, LANDING_TEST_START_DAY)}, when the video or question 1 moves onto a phone's first screen and both versions take the new copy.`,
    arms: ["white_card", "white_video"],
  },
];

/**
 * The versions' names on this page, as the design writes them: arm A has question 1 in the hero,
 * arm B the presenter video. The Slack digest keeps its own names (attribution/server/labels.ts).
 */
const ARM_NAMES = new Map([
  ["white_card", "Question card"],
  ["white_video", "Presenter video"],
]);

/**
 * PostHog's arm tag is read from the first page view of a visit only since round 3 (#540,
 * 7 Oct 2026); before, a returning browser could carry an earlier round's arm.
 */
export const POSTHOG_ARMS_FROM = LANDING_HERO_VIDEO_LAUNCH_DAY;

/**
 * A test's days inside a range, or null when none are. A running test ends yesterday, or today
 * when the range itself runs through today ("Today", or a custom range ending today).
 */
export function testWindow(
  test: LandingTest,
  from: string,
  to: string,
  today: string
): { from: string; to: string } | null {
  const start = test.from > from ? test.from : from;
  const last = test.to ?? (to >= today ? today : addDays(today, -1));
  const end = last < to ? last : to;
  return start > end ? null : { from: start, to: end };
}

/**
 * The first whole (Berlin) day PostHog recorded who saw the hero video: cta_seen 'hero_video' is
 * sent from 12 Oct 2026, 13:00, the film's plays from 8 Oct. The video block reads from here,
 * as a play before it would have no view to be a share of.
 */
export const HERO_VIDEO_SEEN_FROM = "2026-10-13";

/** The range's days the hero video block reads: from HERO_VIDEO_SEEN_FROM on, or none. */
export function heroVideoWindow(from: string, to: string): { from: string; to: string } | null {
  const start = from > HERO_VIDEO_SEEN_FROM ? from : HERO_VIDEO_SEEN_FROM;
  return start > to ? null : { from: start, to };
}

/** The windows to read PostHog's per-arm engagement for: tests it tags reliably. */
export function engagementWindows(
  from: string,
  to: string,
  today: string
): Array<{ key: string; from: string; to: string }> {
  return LANDING_TESTS.flatMap((t) => {
    const w = t.from >= POSTHOG_ARMS_FROM ? testWindow(t, from, to, today) : null;
    return w ? [{ key: t.key, ...w }] : [];
  });
}

export type ArmStatus = "Running" | "Winner" | "Ended";

export interface ArmRow {
  testKey: string;
  test: string;
  /** "A · Question card". */
  label: string;
  arm: string;
  status: ArmStatus;
  from: string;
  to: string;
  visits: number;
  starts: number | null;
  subs: number;
  paid: number;
  revenue: number;
  /** Sum of squared revenue per paying reader, for the spread of revenue per visit. */
  revenueSq: number;
  startCvr: number | null;
  submitCvr: number | null;
  /** Anyone who paid, per visit (the export keeps it). */
  paymentCvr: number | null;
  /** Pre-unlocks (the Initial plan) per visit: null while it isn't on sale. */
  preCvr: number | null;
  /** Full unlocks (Full, Full All, Core) per visit. */
  fullCvr: number | null;
  perVisit: number | null;
  /** PostHog, by its own arm tag; null where it cannot be read per arm. */
  phSessions: number | null;
  phBounced: number | null;
  bounce: number | null;
  medianSeconds: number | null;
  /** Average seconds on the page, each view up to 30 minutes. */
  meanSeconds: number | null;
  /** The views behind that average and the sum of their squared seconds. */
  phTimed: number | null;
  phTimeSq: number | null;
  /** Visits that clicked a call to action, and scrolled 25/50/75/100% before leaving. */
  cta: number | null;
  scroll: Array<number | null> | null;
}

export interface LandingEngagement {
  sessions: number;
  bounce: number | null;
  cta: number | null;
  medianSeconds: number | null;
  meanSeconds: number | null;
  scroll: Array<{ label: string; share: number | null }>;
}

export type VideoStepKey =
  "saw" | "tapped" | "started" | "p25" | "p50" | "p75" | "finished" | "failed";

/** One row of the hero video block: a step's people, and their share of those who saw it. */
export interface VideoStep {
  key: VideoStepKey;
  label: string;
  people: number;
  /** Of the people who saw the video; null when nobody did. */
  share: number | null;
}

/** The presenter video (version B's hero), step by step, from PostHog. */
export interface HeroVideoBlock {
  /** The days read: the range's own, from HERO_VIDEO_SEEN_FROM on; null when none are. */
  days: { from: string; to: string } | null;
  /** Each step, PostHog's failure, or null when it wasn't read. */
  steps: PostHogResult<VideoStep[]> | null;
  /** What the figures can't see in this range, said under them. */
  notes: string[];
}

/** What the headline figures divide, for their info cards ("990 ÷ 10,086 = 9.82%"). */
export interface LandingCounts {
  visits: number | null;
  starts: number | null;
  subs: number;
  /** The range's finishers who bought a full unlock, so far. */
  fullBuyers: number;
  /** Sales paid in the range, EUR. */
  revenue: number;
}

export interface LandingPayload extends PageHead {
  /** The six headline figures, against the period before (all traffic). */
  tiles: Tile[];
  counts: LandingCounts;
  rows: ArmRow[];
  /** Why a test's bounce and time are blank: its PostHog read failed. */
  unread: string[];
  /** Every landing visit in the range together: the engagement table's last row. */
  engagement: PostHogResult<LandingEngagement> | null;
  /**
   * The pay-to-start pages, step by step, as the Pay to start page counts them (so the two
   * agree); null when they could not be read.
   */
  payFirst: { rows: PayFirstRow[]; notes: string[] } | null;
  /** The presenter video, step by step: how many of those who saw it tapped play, and on. */
  heroVideo: HeroVideoBlock;
}

/** One pay-to-start page: its Step by step card's figures on the Pay to start page. */
export interface PayFirstRow {
  key: "full" | "pre";
  /** "/sexual-archetype · €29.99". */
  name: string;
  /** "Pay to start · full". */
  sub: string;
  visitors: number | null;
  checkout: number;
  paid: number;
  /** Paid ÷ visitors. */
  v2p: number | null;
  /** Of the paying buyers ("Paid"), the share who then finished the survey. */
  p2c: number | null;
  /** Paying buyers who started the survey; null where it can't be told (paidStarted). */
  started: number | null;
}

/** Pay to start page notes about what this table doesn't show: ads, and the free survey's funnels. */
const NOT_PAY_FIRST = [
  /^No ad in this range/,
  /^Pay after the report/,
  /page after the survey was on/,
  /the free survey's visits/,
];

/** The two pay-to-start pages, from their funnels on the Pay to start page. */
function payFirstRows(pts: PtsPayload): PayFirstRow[] {
  return (["full", "pre"] as const).flatMap((key): PayFirstRow[] => {
    const x = pts.funnels.find((f) => f.key === key);
    if (!x || !x.live) return [];
    const step = (pick: (label: string) => boolean) => x.steps.find((s) => pick(s.label))?.n ?? 0;
    const visitors = x.steps.find((s) => s.label === "Visits")?.n ?? null;
    const paid = step((l) => l.startsWith("Paid"));
    return [
      {
        key,
        name: `${key === "full" ? "/sexual-archetype" : "/sexual-archetype/initial"} · ${x.label.replace("Pay to start · ", "")}`,
        sub: key === "full" ? "Pay to start · full" : "Pay to start · €1.99 pre",
        visitors,
        checkout: step((l) => l === "Checkout started"),
        paid,
        v2p: visitors ? paid / visitors : null,
        p2c: paid > 0 && x.paidFinished !== undefined ? x.paidFinished / paid : null,
        started: x.paidStarted ?? null,
      },
    ];
  });
}

/** Under this many PostHog visits (or timed views) in an arm, its bounce and time are noise. */
const PH_MIN = 30;

function armRow(
  facts: Facts,
  test: LandingTest,
  w: { from: string; to: string },
  arm: string,
  letter: "A" | "B",
  today: string,
  ph: LandingArmEngagement | undefined,
  /** "Free survey": pay to start's finishers and their starts are out, as on every page. */
  free = false,
  /** The free survey sold no EUR 1.99 (its gate off): the pre-unlock rate is blank, never 0%. */
  preOff = false
): ArmRow {
  const inWindow = (d: string) => d >= w.from && d <= w.to;
  const inFunnel = (x: { pts?: boolean }) => !(free && x.pts);
  // Our own probes are never counted, here as on every page (classifySource "test").
  const visits = facts.visits
    .filter(
      (v) =>
        v.arm === arm &&
        inWindow(v.day) &&
        classifySource({ src: v.src, med: null, ads: false }) !== "test"
    )
    .reduce((n, v) => n + v.n, 0);
  const complete = armStartsComplete(w.from, today);
  const starts = facts.starts
    .filter(
      (s) =>
        s.arm === arm &&
        inWindow(s.day) &&
        !(s.known && classifySource(s) === "test") &&
        inFunnel(s)
    )
    .reduce((n, s) => n + s.n, 0);
  const subs = facts.subs.filter(
    (s) => s.arm === arm && inWindow(s.day) && classifySource(s) !== "test" && inFunnel(s)
  );
  const payers = subs.filter((s) => s.paidAt);
  const revenue = Math.round(payers.reduce((n, s) => n + s.revenue, 0) * 100) / 100;
  const phOk = ph !== undefined && ph.sessions >= PH_MIN;
  return {
    testKey: test.key,
    test: test.name,
    label: `${letter} · ${ARM_NAMES.get(arm) ?? arm}`,
    arm,
    status: test.to === null ? "Running" : test.winner === arm ? "Winner" : "Ended",
    from: w.from,
    to: w.to,
    visits,
    starts: complete ? starts : null,
    subs: subs.length,
    paid: payers.length,
    revenue,
    revenueSq: payers.reduce((n, s) => n + s.revenue * s.revenue, 0),
    startCvr: complete ? ratio(starts, visits) : null,
    submitCvr: ratio(subs.length, visits),
    paymentCvr: ratio(payers.length, visits),
    // Pre-unlocks (the Initial plan) per visit, as the other rates; blank over a window that
    // reaches back before it was on sale (nobody could, so the rate would read low).
    preCvr:
      PRE_PLANS.size && w.from >= PRE_ON_SALE_FROM && !preOff
        ? ratio(subs.filter((s) => preBuysOf(s).length > 0).length, visits)
        : null,
    fullCvr: ratio(subs.filter((s) => s.full).length, visits),
    perVisit: ratio(revenue, visits),
    phSessions: phOk ? ph.sessions : null,
    phBounced: phOk ? ph.bounced : null,
    bounce: phOk ? ratio(ph.bounced, ph.sessions) : null,
    medianSeconds: phOk ? ph.medianSeconds : null,
    meanSeconds: phOk ? ph.meanSeconds : null,
    phTimed: phOk ? ph.timed : null,
    phTimeSq: phOk ? ph.sqSeconds : null,
    cta: phOk ? ratio(ph.cta, ph.sessions) : null,
    scroll: phOk ? ph.scroll.map((n) => ratio(n, ph.leaves)) : null,
  };
}

function pageEngagement(
  all: LandingArmEngagement[],
  time: PostHogResult<LandingTime> | null
): LandingEngagement {
  const sessions = all.reduce((n, e) => n + e.sessions, 0);
  const leaves = all.reduce((n, e) => n + e.leaves, 0);
  const scroll = [0, 1, 2, 3].map((i) => all.reduce((n, e) => n + e.scroll[i]!, 0));
  return {
    sessions,
    bounce: ratio(
      all.reduce((n, e) => n + e.bounced, 0),
      sessions
    ),
    cta: ratio(
      all.reduce((n, e) => n + e.cta, 0),
      sessions
    ),
    // Medians do not add up across versions: the page's own, read for every visit at once.
    medianSeconds: time && time.ok ? time.value.median : null,
    meanSeconds: time && time.ok ? time.value.mean : null,
    scroll: ["25%", "50%", "75%", "100%"].map((label, i) => ({
      label,
      share: ratio(scroll[i]!, leaves),
    })),
  };
}

/** The video block's rows, in its order: a watch's steps, then the starts that failed. */
const VIDEO_STEPS: Array<{ key: VideoStepKey; label: string; of: (v: HeroVideo) => number }> = [
  { key: "saw", label: "Saw the video", of: (v) => v.saw },
  { key: "tapped", label: "Tapped play", of: (v) => v.tapped },
  { key: "started", label: "Started", of: (v) => v.started },
  { key: "p25", label: "Reached 25%", of: (v) => v.reached[0] },
  { key: "p50", label: "Reached 50%", of: (v) => v.reached[1] },
  { key: "p75", label: "Reached 75%", of: (v) => v.reached[2] },
  { key: "finished", label: "Finished", of: (v) => v.finished },
  { key: "failed", label: "Failed to start", of: (v) => v.failed },
];

/**
 * The presenter video's block over the range: each step's people and their share of the people
 * who saw it, read from HERO_VIDEO_SEEN_FROM on, with what the figures can't see.
 */
function heroVideoBlock(
  from: string,
  to: string,
  read: PostHogResult<HeroVideo> | null
): HeroVideoBlock {
  const first = rangeLabel(HERO_VIDEO_SEEN_FROM, HERO_VIDEO_SEEN_FROM);
  const days = heroVideoWindow(from, to);
  if (!days)
    return {
      days: null,
      steps: null,
      notes: [`PostHog records who saw the video from ${first}: pick a range reaching that day.`],
    };
  const notes =
    days.from === from
      ? []
      : [
          `Read from ${first}: PostHog records who saw the video from that day, and a play before it would have no view to be a share of.`,
        ];
  if (!read || !read.ok) return { days, steps: read, notes };
  const v = read.value;
  // A start comes after a tap, so fewer taps than starts means days before taps were recorded.
  if (v.tapped < v.started)
    notes.push(
      "Tapped play is recorded only since its release, so here it counts fewer people than Started: Started, a tap whose film began, is the closest measure for the days before it."
    );
  return {
    days,
    steps: {
      ok: true,
      value: VIDEO_STEPS.map((s) => ({
        key: s.key,
        label: s.label,
        people: s.of(v),
        share: ratio(s.of(v), v.saw),
      })),
    },
    notes,
  };
}

export function buildLanding(input: {
  facts: Facts;
  /** The period before, for the headline figures; null when there is none. */
  previous: Facts | null;
  filters: ApFilters;
  today: string;
  now: Date;
  /** Per test key (engagementWindows), PostHog's engagement by arm. */
  armEngagement: Record<string, PostHogResult<LandingArmEngagement[]>>;
  engagement: PostHogResult<LandingArmEngagement[]> | null;
  /** The page's time on page over the range, every version together. */
  pageTime?: PostHogResult<LandingTime> | null;
  /** The Pay to start page's figures for the range (payToStartFor); null when not read. */
  pts?: PtsPayload | null;
  /** The report's EUR 1.99 gate now, read under "Free survey" only; null when it couldn't be. */
  gateOn?: boolean | null;
  /** PostHog's hero video over heroVideoWindow's days; null (or left out) when not read. */
  video?: PostHogResult<HeroVideo> | null;
}): LandingPayload {
  const { facts, previous, filters: f, today, now } = input;
  const rows: ArmRow[] = [];
  const unread: string[] = [];
  // "Free survey" sells the EUR 1.99 only through the report's gate: with it off and none sold,
  // the arms' pre-unlock rate is blank with why, as the tile's is.
  const preFreeWhy =
    f.funnel === "free"
      ? freePreBlocked(
          input.gateOn,
          subsIn(facts, {
            assessment: "a",
            source: "all",
            device: "all",
            tier: "all",
            visitor: "all",
            funnel: "free",
          }).some((s) => preBuysOf(s).length > 0)
        )
      : null;
  for (const test of LANDING_TESTS) {
    const w = testWindow(test, facts.from, facts.to, today);
    if (!w) continue;
    const ph = input.armEngagement[test.key];
    const byArm = new Map(ph && ph.ok ? ph.value.map((e) => [e.arm, e]) : []);
    const [a, b] = test.arms.map((arm, i) =>
      armRow(
        facts,
        test,
        w,
        arm,
        i === 0 ? "A" : "B",
        today,
        byArm.get(arm),
        f.funnel === "free",
        preFreeWhy !== null
      )
    ) as [ArmRow, ArmRow];
    rows.push(a, b);
    // A failed read is not a small sample: the table says which it was.
    if (ph && !ph.ok)
      unread.push(
        `${test.name}: bounce, median time, CTA clicks and scroll are blank. ${ph.error}`
      );
  }

  // The page reads every visit (the visit log has no source, device, tier or visitor
  // history): its notes must not describe filters a shared link carried in from another page.
  const all: ApFilters = { ...f, source: "all", device: "all", tier: "all", visitor: "all" };
  const pageHead = head(all, today, now);
  const notes = [...pageHead.notes];
  // The tile and the tests' Pre-unlock CVR are blank: said once, for both.
  if (preFreeWhy) notes.push(preFreeWhy);
  if (facts.from < POSTHOG_FROM)
    notes.push(
      `Bounce, time, CTA clicks and scroll come from PostHog, which starts on ${rangeLabel(POSTHOG_FROM, POSTHOG_FROM)}.`
    );

  return {
    ...pageHead,
    ...landingTiles(facts, previous, all, today, now, input.gateOn),
    notes,
    rows,
    unread,
    engagement:
      input.engagement === null
        ? null
        : input.engagement.ok
          ? { ok: true, value: pageEngagement(input.engagement.value, input.pageTime ?? null) }
          : input.engagement,
    // Free survey leaves pay to start out, here as on every page: its pages aren't the free funnel.
    payFirst:
      f.funnel === "free"
        ? {
            rows: [],
            notes: [
              "The Funnel filter is on Free survey, which leaves pay to start out: pick All funnels to see its pages.",
            ],
          }
        : input.pts
          ? {
              rows: payFirstRows(input.pts),
              // Before its pages went live, when they did is all there is to say; then the Pay
              // to start page's notes about the pages, and why a blank Started survey is blank.
              notes: input.pts.funnels.some((x) => x.key !== "after" && x.key !== "gate" && !x.live)
                ? [
                    `Pay to start's pages went live on ${rangeLabel(PAY_TO_START_FROM, PAY_TO_START_FROM)}: pick a range reaching that day.`,
                  ]
                : [
                    ...input.pts.notes.filter((x) => !NOT_PAY_FIRST.some((re) => re.test(x))),
                    ...(payFirstRows(input.pts).some((r) => r.started === null)
                      ? [
                          `Started survey is recorded from ${rangeLabel(SURVEY_STARTED_FROM, SURVEY_STARTED_FROM)}: a paying buyer before then who hasn't finished the survey can't be told apart from one who never started.`,
                        ]
                      : []),
                  ],
            }
          : null,
    heroVideo: heroVideoBlock(facts.from, facts.to, input.video ?? null),
  };
}

/**
 * The design's six figures over every visit, against the period before: survey start and
 * completion, pre-unlock and full-unlock purchases per finished survey, and revenue per
 * visitor (per visit: the visit log counts a browser once a day) and per finished survey.
 * Starts that aren't all recorded leave their rates blank.
 */
function landingTiles(
  facts: Facts,
  previous: Facts | null,
  f: ApFilters,
  today: string,
  now: Date,
  /** The report's EUR 1.99 gate now (under "Free survey" only). */
  gateOn?: boolean | null
): { tiles: Tile[]; counts: LandingCounts } {
  const scope: Scope = {
    assessment: "a",
    source: "all",
    device: "all",
    tier: "all",
    visitor: "all",
    funnel: f.funnel ?? "all",
  };
  const t = totals(facts, scope);
  const p = comparableStarts(
    previous ? totals(previous, scope) : null,
    facts.from,
    previous?.from ?? null,
    today
  );
  const startsWhy = startsComplete(facts.from, today)
    ? null
    : "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared.";
  // The finishers who bought a full unlock so far: the same people as the submissions they are
  // a share of. The earlier period is read at the same age, as every "so far" rate is.
  const fullBuyers = (x: Facts, from = x.from, to = x.to) =>
    subsIn(x, scope, from, to).filter((s) => s.full).length;
  // And those who pre-unlocked (EUR 1.99) so far, the same way.
  const preBuyers = (x: Facts, from = x.from, to = x.to) =>
    subsIn(x, scope, from, to).filter((s) => preBuysOf(s).length > 0).length;
  // "Free survey" sells the EUR 1.99 only through the report's gate: with it off and none sold,
  // blank with why, never 0%.
  const preWhy = f.funnel === "free" ? freePreBlocked(gateOn, preBuyers(facts) > 0) : null;
  const prevAged = previous ? ageMatched(previous, sameAge(facts, previous, now)) : null;
  const points = trendBuckets(facts.from, facts.to);
  const spark = (pick: (from: string, to: string) => number | null) =>
    points.map((b) => pick(b.from, b.to));
  const startsOk = (from: string) => startsComplete(from, today);
  // A tile with nothing to compare with says why, in grey where the change would stand (the
  // Survey page's words), never a bare dash. `gap`: what the period before is missing.
  const noCmp = (prev: number | null, gap: string | null = null): string | undefined =>
    prev !== null
      ? undefined
      : !comparisonRange(f)
        ? "No comparison while today runs"
        : `No comparison: ${!p ? "the period before is before LoveIQ's records" : (gap ?? "nothing in the period before")}`;
  const startsGap = p?.starts === null ? "earlier starts incomplete" : null;
  const visitsGap = p?.visits === null ? "earlier visits not counted" : null;
  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    value: number | null,
    prev: number | null,
    sparkline: Array<number | null>,
    blocked: string | null = null,
    note?: string
  ): Tile => ({
    key,
    label,
    unit,
    value,
    prev,
    goodWhen: "up",
    spark: sparkline,
    foot: "",
    blocked,
    trend: "",
    ...(note !== undefined && !blocked ? { note } : {}),
  });
  const full = fullBuyers(facts);
  const prevFull = prevAged && p ? fullBuyers(prevAged) : null;
  // Nobody could pre-unlock before it was on sale: an earlier period has no rate to compare.
  const prevPre = prevAged && p && previous!.from >= PRE_ON_SALE_FROM ? preBuyers(prevAged) : null;
  const prevStart = p ? ratio(p.starts, p.visits) : null;
  const prevComplete = p ? ratio(p.subs, p.starts) : null;
  const prevFullCvr = p && prevFull !== null ? ratio(prevFull, p.subs) : null;
  const prevPreCvr = p && prevPre !== null ? ratio(prevPre, p.subs) : null;
  const prevPerVisit = p ? ratio(p.revenue, p.visits) : null;
  const prevPerSub = p ? ratio(p.revenue, p.subs) : null;
  const tiles = [
    tile(
      "start-cvr",
      "Survey start CVR",
      "pct",
      ratio(t.starts, t.visits),
      prevStart,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return startsOk(from) ? ratio(x.starts, x.visits) : null;
      }),
      startsWhy,
      noCmp(prevStart, startsGap ?? visitsGap)
    ),
    tile(
      "complete-cvr",
      "Survey complete CVR",
      "pct",
      ratio(t.subs, t.starts),
      prevComplete,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return startsOk(from) ? ratio(x.subs, x.starts) : null;
      }),
      startsWhy,
      noCmp(prevComplete, startsGap)
    ),
    PRE_PLANS.size
      ? tile(
          "pre-cvr",
          "Pre-unlock CVR",
          "pct",
          facts.from < PRE_ON_SALE_FROM || preWhy ? null : ratio(preBuyers(facts), t.subs),
          preWhy ? null : prevPreCvr,
          preWhy
            ? []
            : spark((from, to) =>
                from < PRE_ON_SALE_FROM
                  ? null
                  : ratio(preBuyers(facts, from, to), totals(facts, scope, from, to).subs)
              ),
          facts.from < PRE_ON_SALE_FROM
            ? `Pre-unlock figures start on ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, its first whole day on sale (from the evening before): pick a range from that day on.`
            : preWhy,
          noCmp(prevPreCvr, p && previous!.from < PRE_ON_SALE_FROM ? "not on sale then" : null)
        )
      : tile(
          "pre-cvr",
          "Pre-unlock CVR",
          "pct",
          null,
          null,
          [],
          null,
          "Initial plan not on sale yet"
        ),
    tile(
      "full-cvr",
      "Full-unlock CVR",
      "pct",
      ratio(full, t.subs),
      prevFullCvr,
      spark((from, to) => ratio(fullBuyers(facts, from, to), totals(facts, scope, from, to).subs)),
      null,
      noCmp(prevFullCvr)
    ),
    tile(
      "rev-visit",
      "Revenue / visitor",
      "eur3",
      ratio(t.revenue, t.visits),
      prevPerVisit,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return ratio(x.revenue, x.visits);
      }),
      null,
      noCmp(prevPerVisit, visitsGap)
    ),
    tile(
      "rev-sub",
      "Revenue / survey complete",
      "eur3",
      ratio(t.revenue, t.subs),
      prevPerSub,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return ratio(x.revenue, x.subs);
      }),
      null,
      noCmp(prevPerSub)
    ),
  ];
  return {
    tiles,
    counts: {
      visits: t.visits,
      starts: t.starts,
      subs: t.subs,
      fullBuyers: full,
      revenue: t.revenue,
    },
  };
}
