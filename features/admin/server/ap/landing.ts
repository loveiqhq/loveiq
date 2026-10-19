/**
 * The landing page of AP-Analytics (Marcus's "Landing page & assessment page" artboard, as
 * updated on 16 Oct 2026): six headline figures against the period before, every landing test
 * arm by arm from our own visit log and the people each arm brought, and each version's
 * engagement from PostHog. For Assessment A the landing page is its assessment page.
 */
import { addDays } from "./days";
import { armLabel } from "@features/attribution/server/labels";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import { classifySource, FULL_PLANS, PRE_PLANS, type Facts } from "./facts";
import { rangeLabel, trendBuckets, type ApFilters } from "./filters";
import {
  armStartsComplete,
  comparableStarts,
  ratio,
  salesIn,
  startsComplete,
  totals,
  type Scope,
} from "./metrics";
import { head, type PageHead, type Tile } from "./common";
import {
  POSTHOG_FROM,
  type LandingArmEngagement,
  type LandingTime,
  type PostHogResult,
} from "./posthog";

export interface LandingTest {
  key: string;
  /**
   * The one name every line uses (the table, the compare title, "Not in this range"), with the
   * registry number if any, as the design's "LP-07 · Hero promise".
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

/** The landing tests our records can read, newest first (shared/experiments/landingVariant.ts). */
export const LANDING_TESTS: LandingTest[] = [
  {
    key: "hero",
    name: "#6 · Hero video vs Q1",
    code: "#6",
    from: LANDING_TEST_START_DAY,
    to: null,
    outcome: "Running (test #6 in the registry), read over up to 28 days.",
    arms: ["white_card", "white_video"],
  },
  {
    key: "hero-first-run",
    name: "Hero video vs Q1, first run",
    code: "#6 · run 1",
    from: LANDING_HERO_VIDEO_LAUNCH_DAY,
    to: addDays(LANDING_TEST_START_DAY, -1),
    outcome: `Run again from ${rangeLabel(LANDING_TEST_START_DAY, LANDING_TEST_START_DAY)}, when the video or question 1 moves onto a phone's first screen and both versions take the new copy.`,
    arms: ["white_card", "white_video"],
  },
  {
    key: "rebuild",
    name: "Landing rebuild V1 vs V2",
    code: "Rebuild",
    // The test ran from 21 Aug, but V1's visits were logged without their version until the
    // evening of 24 Aug (49e71d0f): the comparison starts on the first whole day after.
    from: "2026-08-25",
    to: "2026-09-19",
    winner: "white",
    outcome: "V2 kept on 19 Sep 2026, called on the checkout rate (not a proven win).",
    note: "Read from 25 Aug: the test began on 21 Aug, but until then V1's visits were logged without their page version. V2's visits include returning visitors who kept an earlier V2 cookie, which lowers its rates.",
    arms: ["white_prev", "white"],
  },
];

/**
 * PostHog's arm tag is read from the first page view of a visit only since round 3 (#540,
 * 7 Oct 2026); before, a returning browser could carry an earlier round's arm.
 */
export const POSTHOG_ARMS_FROM = LANDING_HERO_VIDEO_LAUNCH_DAY;

/** A test's days inside a range, or null when none are (`today` ends a running test). */
export function testWindow(
  test: LandingTest,
  from: string,
  to: string,
  today: string
): { from: string; to: string } | null {
  const start = test.from > from ? test.from : from;
  const last = test.to ?? addDays(today, -1);
  const end = last < to ? last : to;
  return start > end ? null : { from: start, to: end };
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
  /** "A · Landing Page V2 (Survey in Hero)". */
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

export interface LandingPayload extends PageHead {
  /** The six headline figures, against the period before (all traffic). */
  tiles: Tile[];
  rows: ArmRow[];
  /** Tests with no days in the range. */
  outside: string[];
  /** Why a test's bounce and time are blank: its PostHog read failed. */
  unread: string[];
  /** Every landing visit in the range together: the engagement table's average row. */
  engagement: PostHogResult<LandingEngagement> | null;
  footnotes: string[];
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
  ph: LandingArmEngagement | undefined
): ArmRow {
  const inWindow = (d: string) => d >= w.from && d <= w.to;
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
    .filter((s) => s.arm === arm && inWindow(s.day) && !(s.known && classifySource(s) === "test"))
    .reduce((n, s) => n + s.n, 0);
  const subs = facts.subs.filter(
    (s) => s.arm === arm && inWindow(s.day) && classifySource(s) !== "test"
  );
  const payers = subs.filter((s) => s.paidAt);
  const revenue = Math.round(payers.reduce((n, s) => n + s.revenue, 0) * 100) / 100;
  const phOk = ph !== undefined && ph.sessions >= PH_MIN;
  return {
    testKey: test.key,
    test: test.name,
    label: `${letter} · ${armLabel("landing", arm).short}`,
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
    // The Initial plan (pre-unlock) isn't on sale: no arm has a rate for it yet.
    preCvr: null,
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
}): LandingPayload {
  const { facts, previous, filters: f, today, now } = input;
  const rows: ArmRow[] = [];
  const outside: string[] = [];
  const unread: string[] = [];
  for (const test of LANDING_TESTS) {
    const w = testWindow(test, facts.from, facts.to, today);
    if (!w) {
      outside.push(
        `${test.name} (${test.to === null ? `from ${rangeLabel(test.from, test.from)}` : rangeLabel(test.from, test.to)})`
      );
      continue;
    }
    const ph = input.armEngagement[test.key];
    const byArm = new Map(ph && ph.ok ? ph.value.map((e) => [e.arm, e]) : []);
    const [a, b] = test.arms.map((arm, i) =>
      armRow(facts, test, w, arm, i === 0 ? "A" : "B", today, byArm.get(arm))
    ) as [ArmRow, ArmRow];
    rows.push(a, b);
    // A failed read is not a small sample: the table says which it was.
    if (ph && !ph.ok)
      unread.push(`${test.name}: bounce, avg. time, CTA clicks and scroll are blank. ${ph.error}`);
  }

  // The page reads every visit (the visit log has no source, device, tier or visitor
  // history): its notes must not describe filters a shared link carried in from another page.
  const all: ApFilters = { ...f, source: "all", device: "all", tier: "all", visitor: "all" };
  const pageHead = head(all, today, now);
  const notes = [...pageHead.notes];
  if (facts.from < POSTHOG_FROM)
    notes.push(
      `Bounce, time, CTA clicks and scroll come from PostHog, which starts on ${POSTHOG_FROM}.`
    );

  return {
    ...pageHead,
    tiles: landingTiles(facts, previous, all, today),
    notes,
    rows,
    outside,
    unread,
    engagement:
      input.engagement === null
        ? null
        : input.engagement.ok
          ? { ok: true, value: pageEngagement(input.engagement.value, input.pageTime ?? null) }
          : input.engagement,
    footnotes: [
      "Visits: our own visit log, one per browser per day, by the arm the visitor was shown. Starts: answered at least one question; submissions and payments: the people of that arm, paid whenever.",
      "Round 1 (dark vs white, June 2026) is left out: the records from then cannot reliably tell its two pages' visitors apart.",
    ],
  };
}

/**
 * The design's six figures over every visit, against the period before: survey start and
 * completion, pre-unlock and full-unlock purchases per finished survey, and revenue per
 * visitor and per finished survey. Starts that aren't all recorded leave their rates blank.
 */
function landingTiles(facts: Facts, previous: Facts | null, f: ApFilters, today: string): Tile[] {
  const scope: Scope = {
    assessment: "a",
    source: "all",
    device: "all",
    tier: "all",
    visitor: "all",
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
  const fullSales = (x: Facts, from = x.from, to = x.to) =>
    salesIn(x, scope, from, to).filter((m) => FULL_PLANS.has(m.plan ?? "")).length;
  const preSales = (x: Facts, from = x.from, to = x.to) =>
    salesIn(x, scope, from, to).filter((m) => PRE_PLANS.has(m.plan ?? "")).length;
  const points = trendBuckets(facts.from, facts.to);
  const spark = (pick: (from: string, to: string) => number | null) =>
    points.map((b) => pick(b.from, b.to));
  const startsOk = (from: string) => startsComplete(from, today);
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
    ...(note !== undefined ? { note } : {}),
  });
  const prevFull = previous && p ? fullSales(previous) : null;
  const prevPre = previous && p ? preSales(previous) : null;
  return [
    tile(
      "start-cvr",
      "Survey start CVR",
      "pct",
      ratio(t.starts, t.visits),
      p ? ratio(p.starts, p.visits) : null,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return startsOk(from) ? ratio(x.starts, x.visits) : null;
      }),
      startsWhy
    ),
    tile(
      "complete-cvr",
      "Survey complete CVR",
      "pct",
      ratio(t.subs, t.starts),
      p ? ratio(p.subs, p.starts) : null,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return startsOk(from) ? ratio(x.subs, x.starts) : null;
      }),
      startsWhy
    ),
    PRE_PLANS.size
      ? tile(
          "pre-cvr",
          "Pre-unlock CVR",
          "pct",
          ratio(preSales(facts), t.subs),
          p && prevPre !== null ? ratio(prevPre, p.subs) : null,
          spark((from, to) => ratio(preSales(facts, from, to), totals(facts, scope, from, to).subs))
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
      ratio(fullSales(facts), t.subs),
      p && prevFull !== null ? ratio(prevFull, p.subs) : null,
      spark((from, to) => ratio(fullSales(facts, from, to), totals(facts, scope, from, to).subs))
    ),
    tile(
      "rev-visit",
      "Revenue / visitor",
      "eur3",
      ratio(t.revenue, t.visits),
      p ? ratio(p.revenue, p.visits) : null,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return ratio(x.revenue, x.visits);
      })
    ),
    tile(
      "rev-sub",
      "Revenue / survey complete",
      "eur3",
      ratio(t.revenue, t.subs),
      p ? ratio(p.revenue, p.subs) : null,
      spark((from, to) => {
        const x = totals(facts, scope, from, to);
        return ratio(x.revenue, x.subs);
      })
    ),
  ];
}
