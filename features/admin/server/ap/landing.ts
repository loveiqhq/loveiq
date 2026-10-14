/**
 * The landing page of AP-Analytics (Marcus's "Landing page & assessment page" artboard):
 * every landing test arm by arm, from our own visit log and the people each arm brought;
 * A against B with how likely the difference is real; and the page's engagement from
 * PostHog. For Assessment A the landing page is its assessment page, so the assessment
 * page section reads the same page.
 */
import { addDays } from "./days";
import { MIN_CELL_COUNT, normalCdf, twoProportionSignal } from "@features/admin/server/statistics";
import { armLabel } from "@features/attribution/server/labels";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import { classifySource, type Facts } from "./facts";
import { rangeLabel, type ApFilters } from "./filters";
import { armStartsComplete, ratio } from "./metrics";
import { head, type PageHead } from "./overview";
import {
  POSTHOG_FROM,
  type LandingArmEngagement,
  type LandingSections,
  type PostHogResult,
} from "./posthog";

export interface LandingTest {
  key: string;
  name: string;
  /** One line for the tests table and the compare tabs, with the registry number if any. */
  short: string;
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
    name: "Hero: video vs question 1",
    short: "#6 · Hero video vs Q1",
    from: LANDING_TEST_START_DAY,
    to: null,
    outcome: "Running (test #6 in the registry), read over up to 28 days.",
    arms: ["white_card", "white_video"],
  },
  {
    key: "hero-first-run",
    name: "Hero: video vs question 1, first run",
    short: "Hero video vs Q1, first run",
    from: LANDING_HERO_VIDEO_LAUNCH_DAY,
    to: addDays(LANDING_TEST_START_DAY, -1),
    outcome: `Run again from ${rangeLabel(LANDING_TEST_START_DAY, LANDING_TEST_START_DAY)}, when the video or question 1 moves onto a phone's first screen and both versions take the new copy.`,
    arms: ["white_card", "white_video"],
  },
  {
    key: "rebuild",
    name: "Landing rebuild: V1 vs V2",
    short: "Landing rebuild V1 vs V2",
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
  testShort: string;
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
  paymentCvr: number | null;
  perVisit: number | null;
  /** PostHog, by its own arm tag; null where it cannot be read per arm. */
  phSessions: number | null;
  phBounced: number | null;
  bounce: number | null;
  medianSeconds: number | null;
}

export interface CompareMetric {
  label: string;
  unit: "pct" | "eur3" | "mmss";
  a: number | null;
  b: number | null;
  lowerIsBetter: boolean;
  verdict: string;
}

export interface Comparison {
  key: string;
  name: string;
  short: string;
  window: string;
  outcome: string;
  note?: string;
  a: string;
  b: string;
  metrics: CompareMetric[];
}

export interface LandingEngagement {
  sessions: number;
  bounce: number | null;
  cta: number | null;
  medianSeconds: number | null;
  scroll: Array<{ label: string; share: number | null }>;
}

export interface SectionsView {
  from: string;
  to: string;
  sessions: number;
  rows: Array<{ section: string; name: string; reach: number | null }>;
  testimonials: { seen: number | null; startedSeen: number | null; startedNotSeen: number | null };
}

export interface LandingPayload extends PageHead {
  rows: ArmRow[];
  /** Tests with no days in the range. */
  outside: string[];
  comparisons: Comparison[];
  engagement: PostHogResult<LandingEngagement> | null;
  sections: PostHogResult<SectionsView | null> | null;
  footnotes: string[];
}

/** The landing's sections top to bottom, as `data-landing-section` names them. */
export const SECTION_NAMES: Array<[string, string]> = [
  ["trust_strip", "Trust strip"],
  ["discover", "Discover"],
  ["vocab", "Vocabulary"],
  ["find_out", "Find out"],
  ["wow_stats", "Numbers"],
  ["result_teaser", "Result teaser"],
  ["archetypes", "14 archetypes"],
  ["testimonials", "Field reports"],
  ["foundation", "The science"],
  ["faq", "FAQ"],
  ["closing_cta", "Final CTA"],
  ["footer", "Footer"],
];

/** "86% chance B is better" from a z-score oriented so that positive favours B (never 100%). */
function chanceText(z: number): string {
  if (!Number.isFinite(z)) return "Too few to call";
  const p = normalCdf(z);
  const shown = (x: number) => `${Math.min(99, Math.round(x * 100))}%`;
  return p >= 0.5 ? `${shown(p)} chance B is better` : `${shown(1 - p)} chance A is better`;
}

/**
 * How likely B beats A on a rate: the normal approximation to the difference of two
 * proportions, read as a probability. Refuses where the team's readouts refuse
 * (twoProportionSignal: under 50 people, or fewer than 5 of either outcome in an arm).
 */
export function rateVerdict(
  kA: number,
  nA: number,
  kB: number,
  nB: number,
  lowerIsBetter = false,
  few = "Too few to call"
): string {
  if (twoProportionSignal(nA, kA, nB, kB).significance === "insufficient-data") return few;
  const pA = kA / nA;
  const pB = kB / nB;
  const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  if (se === 0) return "No difference";
  return chanceText((lowerIsBetter ? pA - pB : pB - pA) / se);
}

/** The same for revenue per visit: a visit earns 0 or what its reader paid. */
export function revenueVerdict(a: ArmRow, b: ArmRow): string {
  if (a.visits === 0 || b.visits === 0) return "Too few to call";
  if (a.paid < MIN_CELL_COUNT || b.paid < MIN_CELL_COUNT) return "Too few payments to call";
  const variance = (r: ArmRow) => Math.max(0, r.revenueSq / r.visits - (r.revenue / r.visits) ** 2);
  const se = Math.sqrt(variance(a) / a.visits + variance(b) / b.visits);
  if (se === 0) return "No difference";
  return chanceText((b.revenue / b.visits - a.revenue / a.visits) / se);
}

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
  // Too few PostHog sessions in an arm and its bounce and time are noise.
  const phOk = ph !== undefined && ph.sessions >= 30;
  return {
    testKey: test.key,
    test: test.name,
    testShort: test.short,
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
    perVisit: ratio(revenue, visits),
    phSessions: phOk ? ph.sessions : null,
    phBounced: phOk ? ph.bounced : null,
    bounce: phOk ? ratio(ph.bounced, ph.sessions) : null,
    medianSeconds: phOk ? ph.medianSeconds : null,
  };
}

function compare(
  test: LandingTest,
  w: { from: string; to: string },
  a: ArmRow,
  b: ArmRow
): Comparison {
  const posthog = test.from >= POSTHOG_ARMS_FROM;
  const phVerdict = (x: number | null, y: number | null) =>
    !posthog
      ? "Before 7 Oct 2026 PostHog did not reliably know which version a visitor saw"
      : x === null || y === null
        ? "PostHog saw too few visits"
        : null;
  return {
    key: test.key,
    name: test.name,
    short: test.short,
    window: rangeLabel(w.from, w.to),
    outcome: test.outcome,
    note: test.note,
    a: a.label,
    b: b.label,
    metrics: [
      {
        label: "Survey start CVR",
        unit: "pct",
        a: a.startCvr,
        b: b.startCvr,
        lowerIsBetter: false,
        verdict:
          a.starts === null || b.starts === null
            ? "Not recorded for these days: see the note under the tests"
            : rateVerdict(a.starts, a.visits, b.starts, b.visits),
      },
      {
        label: "Survey submission CVR",
        unit: "pct",
        a: a.submitCvr,
        b: b.submitCvr,
        lowerIsBetter: false,
        verdict: rateVerdict(a.subs, a.visits, b.subs, b.visits),
      },
      {
        label: "Payment CVR",
        unit: "pct",
        a: a.paymentCvr,
        b: b.paymentCvr,
        lowerIsBetter: false,
        verdict: rateVerdict(a.paid, a.visits, b.paid, b.visits, false, "Too few payments to call"),
      },
      {
        label: "€ rev. per visit",
        unit: "eur3",
        a: a.perVisit,
        b: b.perVisit,
        lowerIsBetter: false,
        verdict: revenueVerdict(a, b),
      },
      {
        label: "Bounce rate",
        unit: "pct",
        a: a.bounce,
        b: b.bounce,
        lowerIsBetter: true,
        verdict:
          phVerdict(a.bounce, b.bounce) ??
          rateVerdict(a.phBounced!, a.phSessions!, b.phBounced!, b.phSessions!, true) +
            " (PostHog)",
      },
      {
        label: "Time on page (median)",
        unit: "mmss",
        a: a.medianSeconds === null ? null : a.medianSeconds * 1000,
        b: b.medianSeconds === null ? null : b.medianSeconds * 1000,
        lowerIsBetter: false,
        verdict:
          phVerdict(a.medianSeconds, b.medianSeconds) ??
          "PostHog; medians are not tested for chance",
      },
    ],
  };
}

function pageEngagement(
  all: LandingArmEngagement[],
  median: PostHogResult<number | null> | null
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
    medianSeconds: median && median.ok ? median.value : null,
    scroll: ["25%", "50%", "75%", "100%"].map((label, i) => ({
      label,
      share: ratio(scroll[i]!, leaves),
    })),
  };
}

function sectionsView(s: LandingSections): SectionsView {
  const reach = new Map(s.reach.map((r) => [r.section, r.sessions]));
  const notSeen = s.sessions - s.testimonials.seen;
  return {
    from: s.from,
    to: s.to,
    sessions: s.sessions,
    rows: SECTION_NAMES.map(([section, name]) => ({
      section,
      name,
      reach: ratio(reach.get(section) ?? 0, s.sessions),
    })),
    testimonials: {
      seen: ratio(s.testimonials.seen, s.sessions),
      startedSeen: ratio(s.testimonials.started, s.testimonials.seen),
      startedNotSeen: ratio(s.started - s.testimonials.started, notSeen),
    },
  };
}

export function buildLanding(input: {
  facts: Facts;
  filters: ApFilters;
  today: string;
  now: Date;
  /** Per test key (engagementWindows), PostHog's engagement by arm. */
  armEngagement: Record<string, PostHogResult<LandingArmEngagement[]>>;
  engagement: PostHogResult<LandingArmEngagement[]> | null;
  /** The page's median time on page over the range, every version together. */
  pageMedian?: PostHogResult<number | null> | null;
  sections: PostHogResult<LandingSections | null> | null;
}): LandingPayload {
  const { facts, filters: f, today, now } = input;
  const rows: ArmRow[] = [];
  const outside: string[] = [];
  const comparisons: Comparison[] = [];
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
    comparisons.push(compare(test, w, a, b));
  }

  const pageHead = head(f, today, now);
  const notes = [...pageHead.notes];
  if (facts.from < POSTHOG_FROM)
    notes.push(
      `Bounce, time, scroll and section reach come from PostHog, which starts on ${POSTHOG_FROM}.`
    );

  return {
    ...pageHead,
    // Nothing here compares periods: a test's arms are compared with each other.
    compare: null,
    notes,
    rows,
    outside,
    comparisons,
    engagement:
      input.engagement === null
        ? null
        : input.engagement.ok
          ? { ok: true, value: pageEngagement(input.engagement.value, input.pageMedian ?? null) }
          : input.engagement,
    sections:
      input.sections === null
        ? null
        : input.sections.ok
          ? { ok: true, value: input.sections.value ? sectionsView(input.sections.value) : null }
          : input.sections,
    footnotes: [
      "Visits: our own visit log, one per browser per day, by the arm the visitor was shown. Starts: answered at least one question; submissions and payments: the people of that arm, paid whenever.",
      "Round 1 (dark vs white, June 2026) is left out: the records from then cannot reliably tell its two pages' visitors apart.",
      "The chances count each daily visit as one try and are read every day, so they look surer than they are: decide at the test's planned end, not on one day's reading.",
    ],
  };
}
