import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  TINY_ARM,
  twoProportionSignal,
} from "@features/admin/server/statistics";
import { isPayToStartTracker } from "@features/pay-to-start/logic/journey";
import {
  assignGateRevealArm,
  GATE_REVEAL_ARM_KEY,
  GATE_REVEAL_START_AT,
  isGateRevealArm,
  type GateRevealArm,
} from "@shared/experiments/gateRevealArm";
import { isGatePriceArm } from "@shared/experiments/gatePriceArm";
import { reportingDateTime, reportingDay, reportingDayStart } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import { addDays } from "./days";
import { preBuysOf, type SubFact } from "./facts";
import { rangeLabel } from "./filters";
import { fmt } from "./format";
import { liveSince } from "./traffic";

/**
 * AP-Analytics, Payment · #11, Mark's new EUR 1.99 page as a 50/50
 * (shared/experiments/gateRevealArm.ts): half the free finishers meet his page, which shows
 * their Core Archetype before payment, half meet today's. The registry decides it on the share
 * of free finishers who pay the EUR 1.99 (the initial unlock), per half, counted from the
 * switch-on; read beside it: who reached the page, the rate among them, and full-report
 * purchases.
 *
 * Read from the page's own finishers (ap_facts: the range under its filters, the team and our
 * probes left out), as the pricing tests beside it are: those who finished from the switch-on,
 * less those who paid before the survey (pay to start), who never meet a EUR 1.99 page. A
 * finisher's half is the one stamped on their survey, else the one their session gives, as the
 * report's server works it out when it builds the page. Reached is the server's first view of
 * the page (initial_gate_seen_at), as the exits section and Pay to start count it; paid is the
 * EUR 1.99 tiles' rule (preBuysOf); full is a full unlock bought. All so far.
 *
 * The verdict is the shared A/B readouts' (experiment-readouts.ts), worded without their dashes:
 * the same two-proportion signal and floors, never a winner the numbers can't support.
 */

/** The test as the page names it, with its registry number. */
export const GATE_TEST_NAME = "#11 · New €1.99 page";

/** Each half as the page names it; today's page is the control. */
const HALVES: ReadonlyArray<{ arm: GateRevealArm; name: string }> = [
  { arm: "control", name: "Today's €1.99 page" },
  { arm: "reveal", name: "New page: Core Archetype shown" },
];

/** A survey finished from the switch-on, as read for its half (readGateTestRows). */
export interface GateTestRow {
  id: number;
  session_id: string | null;
  utm_tracker: string | null;
}

/** One half's free finishers and what they did on the EUR 1.99 page, so far. */
export interface GateTestArm {
  arm: GateRevealArm;
  name: string;
  control: boolean;
  finishers: number;
  /** Of them, those whose report showed the EUR 1.99 page; null when that couldn't be read. */
  reached: number | null;
  /** Of them, those who paid the EUR 1.99: the decider's count. */
  paid: number;
  /** Of those who reached the page, those who paid it; null with reached. */
  paidReached: number | null;
  /** Of them, those who bought a full unlock. */
  full: number;
}

export interface GateTestBlock {
  test: string;
  /** "Since 17 Nov 2026 · live", and whether the range cuts it or misses it. */
  note: string;
  /** Today's page, then the new one; empty when the section is blank (why). */
  arms: GateTestArm[];
  /** On the decider: the new page's rate over today's, less 1; null when it can't be called. */
  lift: number | null;
  /** 1 − p of the two-sided two-proportion test; null when it can't be called. */
  confidence: number | null;
  /** Why lift and confidence are blank, in a few words, or null. */
  liftWhy: string | null;
  /** The readout in plain words. */
  verdict: string;
  /** Why the section is blank, or null. */
  why: string | null;
}

/**
 * The surveys finished from the switch-on (or from the range's first day, when later), with
 * their session id and tracker: each one's half and pay-to-start label. Null when the read
 * fails: a partial read is never counted.
 */
export async function readGateTestRows(from: string): Promise<GateTestRow[] | null> {
  const since = Math.max(Date.parse(GATE_REVEAL_START_AT), reportingDayStart(from).getTime());
  const rows = await fetchAllRows<GateTestRow>(
    "/rest/v1/survey_submission?status=eq.completed" +
      `&created_date_time=gte.${encodeURIComponent(new Date(since).toISOString())}` +
      "&select=id,session_id,utm_tracker&order=id.asc"
  );
  return rows ?? null;
}

/**
 * A survey's half: the one its server stamped (gate_reveal_arm in utm_tracker), else the one its
 * session id gives, as the report's server works it out when it builds the page (no session:
 * today's page). The two agree by construction; a survey without a tracker, or with no room
 * left in it, has no stamp.
 */
export function gateArmOf(row: Pick<GateTestRow, "session_id" | "utm_tracker">): GateRevealArm {
  const stamped = gateStampOf(row);
  return isGateRevealArm(stamped) ? stamped : assignGateRevealArm(row.session_id);
}

/** The value stamped under gate_reveal_arm, whichever test wrote it, or null. */
function gateStampOf(row: Pick<GateTestRow, "utm_tracker">): unknown {
  let stamped: unknown = null;
  try {
    const j: unknown = JSON.parse(row.utm_tracker ?? "null");
    if (j && typeof j === "object" && !Array.isArray(j)) {
      // eslint-disable-next-line security/detect-object-injection -- a constant key, read only.
      stamped = (j as Record<string, unknown>)[GATE_REVEAL_ARM_KEY];
    }
  } catch {
    // Not JSON: no stamp.
  }
  // The price test that replaced this one writes its own halves under the same key
  // (shared/experiments/gatePriceArm.ts): those are kept apart by buildGateTest, never hashed.
  return isGateRevealArm(stamped) || isGatePriceArm(stamped) ? stamped : null;
}

interface Half {
  name: string;
  /** Finishers, and those who paid the EUR 1.99. */
  n: number;
  k: number;
}

/**
 * The readout in words, by buildReadout's rules (experiment-readouts.ts): too few in all, a half
 * under TINY_ARM, too few payments for the test (MIN_CELL_COUNT), no clear winner, or a winner
 * the test supports. `why` is the short reason the lift is blank, or null when it can be called.
 */
function readout(a: Half, b: Half): { verdict: string; why: string | null } {
  const finishers = (n: number) => `${fmt("count", n)} ${n === 1 ? "finisher" : "finishers"}`;
  if (a.n === 0 && b.n === 0) return { verdict: "No data yet.", why: "No one in the test yet" };
  if (a.n === 0 || b.n === 0) {
    const only = a.n > 0 ? a : b;
    return {
      verdict: `Only ${only.name} has data, so there is nothing to compare against.`,
      why: "No one in a half yet",
    };
  }
  const rate = (h: Half) => h.k / h.n;
  // The leader by rate, today's page on a tie, as buildReadout sorts them.
  const [leader, runnerUp] = rate(b) > rate(a) ? [b, a] : [a, b];
  const smallest = b.n < a.n ? b : a;
  if (a.n + b.n < 50) {
    return {
      verdict: `Not enough data to call this yet: the smallest group has ${finishers(smallest.n)}. Treat any difference as noise for now.`,
      why: "Too early to compare",
    };
  }
  if (smallest.n < TINY_ARM) {
    return {
      verdict: `Too early to compare: ${smallest.name} has only ${finishers(smallest.n)} so far. Ignore the difference until that grows.`,
      why: "Too early to compare",
    };
  }
  const signal = twoProportionSignal(runnerUp.n, runnerUp.k, leader.n, leader.k);
  if (signal.significance === "insufficient-data") {
    const k = a.k + b.k;
    return {
      verdict: `Not enough €1.99 payments yet to compare: ${fmt("count", k)} ${k === 1 ? "finisher has" : "finishers have"} paid across both groups. Each side needs at least ${MIN_CELL_COUNT}.`,
      why: "Too few payments to call",
    };
  }
  const [hi, lo] = [fmt("pct", rate(leader)), fmt("pct", rate(runnerUp))];
  if (signal.significance === "inconclusive") {
    return {
      verdict:
        hi === lo
          ? `No clear winner yet: both are at ${hi}.`
          : `No clear winner yet. ${leader.name} is ahead (${hi} vs ${lo}) but the gap could still be chance.`,
      why: null,
    };
  }
  return {
    verdict: `${leader.name} is genuinely ahead: ${hi} vs ${lo} (${formatSignalSummary(signal)}).`,
    why: null,
  };
}

export function buildGateTest(input: {
  /** The page's finishers: the range under its filters, the team and our probes left out. */
  subs: SubFact[];
  /** readGateTestRows; null when it couldn't be read. */
  rows: GateTestRow[] | null;
  /** The surveys whose report saw the EUR 1.99 page (readGateSeen); null when unreadable. */
  gateSeen: ReadonlySet<number> | null;
  /** peopleBlocked's reason under these filters, or null. */
  blocked: string | null;
  /** The range's first and last day, and today. */
  from: string;
  to: string;
  today: string;
}): GateTestBlock {
  const start = Date.parse(GATE_REVEAL_START_AT);
  const startDay = reportingDay(new Date(start));
  const rangeFrom = reportingDayStart(input.from).getTime();
  const rangeUntil = reportingDayStart(addDays(input.to, 1)).getTime();
  const inRange = Math.max(start, rangeFrom) < rangeUntil;
  // As the pricing tests: a range starting after the switch-on cuts the test, and so does one
  // ending before yesterday, the last whole day of a test that runs on.
  const cut = rangeFrom > start || input.to < addDays(input.today, -1);
  const note = `${liveSince(startDay)}${!inRange ? " · not in this range" : cut ? " · cut to this range" : ""}`;
  const blank = (why: string): GateTestBlock => ({
    test: GATE_TEST_NAME,
    note,
    arms: [],
    lift: null,
    confidence: null,
    liftWhy: null,
    verdict: "",
    why,
  });
  if (input.blocked) return blank(input.blocked);
  if (!inRange) {
    const time = reportingDateTime(new Date(start)).split(" ")[1];
    return blank(
      `Not running in this range: the test began on ${rangeLabel(startDay, startDay)} at ${time}. Pick a range that reaches it.`
    );
  }
  if (!input.rows) return blank("Who is in which half could not be read just now.");

  const rowOf = new Map(input.rows.map((r) => [r.id, r]));
  const halves = new Map<GateRevealArm, SubFact[]>(HALVES.map((h) => [h.arm, []]));
  for (const s of input.subs) {
    const row = rowOf.get(s.id);
    // From the switch-on only, and never a survey bought before it was taken: claimed by a
    // completed purchase (pts), or carrying the journey's label. A finisher the read missed
    // (finished between the two reads) is counted on the next load.
    if (Date.parse(s.at) < start || s.pts || !row || isPayToStartTracker(row.utm_tracker)) continue;
    // A finisher of the price test that retired this one (24 Nov 2026) is in neither half: its
    // stamp is `fixed` or `choose`, and its session's hash would file it here by mistake.
    if (isGatePriceArm(gateStampOf(row))) continue;
    halves.get(gateArmOf(row))!.push(s);
  }
  const seen = input.gateSeen;
  const paid = (s: SubFact) => preBuysOf(s).length > 0;
  const arms = HALVES.map(({ arm, name }): GateTestArm => {
    const xs = halves.get(arm)!;
    const reached = seen ? xs.filter((s) => seen.has(s.id)) : null;
    return {
      arm,
      name,
      control: arm === "control",
      finishers: xs.length,
      reached: reached ? reached.length : null,
      paid: xs.filter(paid).length,
      paidReached: reached ? reached.filter(paid).length : null,
      full: xs.filter((s) => s.full).length,
    };
  });
  const [c, r] = arms as [GateTestArm, GateTestArm];
  const { verdict, why } = readout(
    { name: c.name, n: c.finishers, k: c.paid },
    { name: r.name, n: r.finishers, k: r.paid }
  );
  const signal =
    why === null ? twoProportionSignal(c.finishers, c.paid, r.finishers, r.paid) : null;
  return {
    test: GATE_TEST_NAME,
    note,
    arms,
    lift: signal && c.paid > 0 ? r.paid / r.finishers / (c.paid / c.finishers) - 1 : null,
    confidence: signal?.pValue != null ? 1 - signal.pValue : null,
    liftWhy: why,
    verdict,
    why: null,
  };
}
