import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  TINY_ARM,
  twoProportionSignal,
} from "@features/admin/server/statistics";
import { isPayToStartTracker } from "@features/pay-to-start/logic/journey";
import {
  CHOOSE_PRICE_TILES,
  isChoosePriceOption,
  type ChoosePriceOption,
} from "@features/report/logic/choosePrice";
import { GATE_CHOOSE_COPY } from "@features/report/ui/gate/gateChoosePriceContent";
import { GATE_REVEAL_ARM_KEY } from "@shared/experiments/gateRevealArm";
import { isGatePriceArm, type GatePriceArm } from "@shared/experiments/gatePriceArm";
import { reportingDayStart } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import { preBuysOf, type SubFact } from "./facts";
import { fmt } from "./format";

/**
 * AP-Analytics, Payment · the pre-unlock price test (Marcus's board "Assessment A · Payment
 * copy", 24 Nov 2026; shared/experiments/gatePriceArm.ts): half the free finishers meet today's
 * EUR 1.99 page, half the "Choose your price" page, where they pick EUR 0, 6.99, 19.99 or their
 * own amount for the same pre-unlock. It replaced #11 (the Core Archetype shown), and its
 * section took #11's place on the page.
 *
 * Read as #11 was, from the page's own finishers (ap_facts: the range under its filters, the
 * team and our probes left out), less those who paid before the survey. A finisher is in the
 * test when their survey carries its stamp, `fixed` or `choose` under utm_tracker's
 * gate_reveal_arm, which the survey's server writes while the test's switch is on: no date to
 * keep, and #11's `control`/`reveal` never count. Reached is the server's first view of the page
 * (initial_gate_seen_at); paid is the Pre-unlock tiles' rule (preBuysOf: a real initial payment
 * above EUR 0), at the price paid; a EUR 0 choice is a free claim, never a sale; full is a full
 * unlock bought. All so far. The choosing half's pick comes from its payment
 * (`metadata.priceOption`).
 *
 * Revenue per free finisher decides it (the board: "How it's decided"), the pay rate and the
 * free claims read beside it. The pay rates are compared by the shared A/B readouts' rules
 * (experiment-readouts.ts); the revenue is only ever reported, never called.
 */

/** The first day a survey can carry the test's stamp, this code's release: its reads start here. */
export const GATE_PRICE_FROM = "2026-11-24";

/** The section's title, as the board names it. */
export const PRICE_TEST_NAME = "Pre-unlock price test: €1.99 vs choose your price";

/** Each half as the board names it; today's page is the control. */
const ARMS: ReadonlyArray<{ arm: GatePriceArm; name: string; sub: string }> = [
  { arm: "fixed", name: "A · Fixed €1.99", sub: "Control: today’s page" },
  {
    arm: "choose",
    name: "B · Choose your price",
    sub: `${fmt("eur", centsOf("fair") / 100)} ${GATE_CHOOSE_COPY.card.notes.fair.toLowerCase()}`,
  },
];

function centsOf(option: Exclude<ChoosePriceOption, "custom">): number {
  return CHOOSE_PRICE_TILES.find((tile) => tile.option === option)?.cents ?? 0;
}

/** The choosing half's picks with a price, in the page's order, as its tiles name them. */
const tileName = (option: "fair" | "support", note: string) =>
  `${fmt("eur", centsOf(option) / 100)} · ${note}`;
const PAID_OPTIONS: ReadonlyArray<{ option: ChoosePriceOption; name: string; sub: string }> = [
  { option: "fair", name: tileName("fair", GATE_CHOOSE_COPY.card.notes.fair), sub: "" },
  { option: "support", name: tileName("support", GATE_CHOOSE_COPY.card.notes.support), sub: "" },
  { option: "custom", name: GATE_CHOOSE_COPY.card.own, sub: "avg. of what they chose" },
];

/** A survey finished in the range, with its tracker: its half and its pay-to-start label. */
export interface PriceTestRow {
  id: number;
  utm_tracker: string | null;
}

/** One half's free finishers and what they did on its page, so far. */
export interface PriceTestArm {
  arm: GatePriceArm;
  name: string;
  sub: string;
  control: boolean;
  finishers: number;
  /** Of them, those whose report showed the page; null when that couldn't be read. */
  reached: number | null;
  /** Of them, those who paid for the pre-unlock (above EUR 0). */
  paid: number;
  /** What they paid, in euros. */
  revenue: number;
  /** Of them, those who took it for EUR 0 (the choosing half only). */
  free: number;
  /** Of them, those who bought a full unlock. */
  full: number;
}

/** A pick on the choosing half: how many paid with it, and what they paid. */
export interface PriceTestOption {
  option: ChoosePriceOption;
  name: string;
  sub: string;
  n: number;
  revenue: number;
}

export interface PriceTestBlock {
  test: string;
  /** Today's page, then Choose your price; empty when the section is blank (why). */
  arms: PriceTestArm[];
  /** The choosing half's paid picks, in the page's order (its EUR 0 is `arms[1].free`). */
  options: PriceTestOption[];
  /** The readout in plain words. */
  verdict: string;
  /** Why the section is blank, or null. */
  why: string | null;
}

/** The stamped half of a survey, or null when it carries none of this test's. */
export function priceArmOf(row: Pick<PriceTestRow, "utm_tracker">): GatePriceArm | null {
  try {
    const j: unknown = JSON.parse(row.utm_tracker ?? "null");
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    // eslint-disable-next-line security/detect-object-injection -- a constant key, read only.
    const stamped = (j as Record<string, unknown>)[GATE_REVEAL_ARM_KEY];
    return isGatePriceArm(stamped) ? stamped : null;
  } catch {
    return null;
  }
}

/** Where the reads start: the range's first day, never before the test could stamp anyone. */
function readsFrom(from: string): string {
  const since = Math.max(
    reportingDayStart(GATE_PRICE_FROM).getTime(),
    reportingDayStart(from).getTime()
  );
  return encodeURIComponent(new Date(since).toISOString());
}

/**
 * The surveys finished from the range's first day (never before GATE_PRICE_FROM), with their
 * tracker: each one's half and pay-to-start label. Null when the read fails.
 */
export async function readPriceTestRows(from: string): Promise<PriceTestRow[] | null> {
  const rows = await fetchAllRows<PriceTestRow>(
    "/rest/v1/survey_submission?status=eq.completed" +
      `&created_date_time=gte.${readsFrom(from)}` +
      "&select=id,utm_tracker&order=id.asc"
  );
  return rows ?? null;
}

/**
 * The choosing half's picks: each survey's pre-unlock payment that names one (`priceOption`),
 * from the range's first day on. A survey keeps its first. Null when the read fails.
 */
export async function readPriceTestChoices(
  from: string
): Promise<Map<number, ChoosePriceOption> | null> {
  const rows = await fetchAllRows<{
    option: string | null;
    personal_report: { survey_submission_id: number | null } | null;
  }>(
    // E07's gift never names a pick; the guard keeps it out in so many words.
    "/rest/v1/payment?status=eq.succeeded&is_test=is.false&metadata->>gifted=is.null" +
      "&metadata->>plan=eq.initial&metadata->>priceOption=not.is.null" +
      `&created_date_time=gte.${readsFrom(from)}` +
      "&select=option:metadata->>priceOption," +
      "personal_report!fk_payment_personal_report(survey_submission_id)&order=id.asc"
  );
  if (!rows) return null;
  const picks = new Map<number, ChoosePriceOption>();
  for (const row of rows) {
    const id = row.personal_report?.survey_submission_id;
    if (typeof id === "number" && isChoosePriceOption(row.option) && !picks.has(id)) {
      picks.set(id, row.option);
    }
  }
  return picks;
}

/**
 * The readout in words: the revenue per free finisher of each half, the pay rates by the shared
 * A/B readouts' rules (too few in all, a half under TINY_ARM, too few payments, no clear winner,
 * or a gap the test supports), and the free claims.
 */
function readout(a: PriceTestArm, b: PriceTestArm): string {
  if (a.finishers === 0 && b.finishers === 0) return "No data yet.";
  if (a.finishers === 0 || b.finishers === 0) {
    const only = a.finishers > 0 ? a : b;
    return `Only ${only.name} has data, so there is nothing to compare against.`;
  }
  const perFinisher = (h: PriceTestArm) => fmt("eur", h.revenue / h.finishers, 2);
  const payRate = (h: PriceTestArm) => fmt("pct", h.paid / h.finishers);
  const claims = `${fmt("count", b.free)} ${b.free === 1 ? "reader" : "readers"} took it for €0`;
  const lead = `Choose your price earns ${perFinisher(b)} per free finisher against ${perFinisher(a)} on today’s page; ${payRate(b)} paid against ${payRate(a)}, and ${claims}.`;

  const smallest = Math.min(a.finishers, b.finishers);
  if (a.finishers + b.finishers < 50 || smallest < TINY_ARM) {
    return `${lead} Too early to call: the smaller half has ${fmt("count", smallest)} free ${smallest === 1 ? "finisher" : "finishers"}, so treat any gap as noise for now.`;
  }
  const signal = twoProportionSignal(a.finishers, a.paid, b.finishers, b.paid);
  const watch =
    " Revenue per finisher decides it: watch the free claims and the lowest amounts, which pull the average price down.";
  if (signal.significance === "insufficient-data") {
    return `${lead} Too few payments to compare the pay rates yet: each half needs at least ${MIN_CELL_COUNT}.${watch}`;
  }
  if (signal.significance === "inconclusive") {
    return `${lead} The pay rates could still differ by chance.${watch}`;
  }
  return `${lead} The pay-rate gap is real (${formatSignalSummary(signal)}).${watch}`;
}

export function buildPriceTest(input: {
  /** The page's finishers: the range under its filters, the team and our probes left out. */
  subs: SubFact[];
  /** readPriceTestRows; null when it couldn't be read. */
  rows: PriceTestRow[] | null;
  /** readPriceTestChoices; null when it couldn't be read. */
  choices: ReadonlyMap<number, ChoosePriceOption> | null;
  /** The surveys whose report saw the EUR 1.99 page (readGateSeen); null when unreadable. */
  gateSeen: ReadonlySet<number> | null;
  /** peopleBlocked's reason under these filters, or null. */
  blocked: string | null;
  /** The range's last day. */
  to: string;
}): PriceTestBlock {
  const blank = (why: string): PriceTestBlock => ({
    test: PRICE_TEST_NAME,
    arms: [],
    options: [],
    verdict: "",
    why,
  });
  if (input.blocked) return blank(input.blocked);
  if (input.to < GATE_PRICE_FROM) {
    return blank(
      "Not running in this range: the test starts with its switch, from 24 Nov 2026. Pick a range that reaches it."
    );
  }
  if (!input.rows || !input.choices) {
    return blank("Who is in which half could not be read just now.");
  }

  const armOf = new Map<number, GatePriceArm>();
  for (const row of input.rows) {
    // Never a survey bought before it was taken: it meets no EUR 1.99 page.
    if (isPayToStartTracker(row.utm_tracker)) continue;
    const arm = priceArmOf(row);
    if (arm) armOf.set(row.id, arm);
  }
  const seen = input.gateSeen;
  const choices = input.choices;
  const options = new Map<ChoosePriceOption, PriceTestOption>(
    PAID_OPTIONS.map((o) => [o.option, { ...o, n: 0, revenue: 0 }])
  );
  const arms = ARMS.map(({ arm, name, sub }): PriceTestArm => {
    // Claimed by a completed purchase before the survey (pts): never on a EUR 1.99 page.
    const xs = input.subs.filter((s) => !s.pts && armOf.get(s.id) === arm);
    let paid = 0;
    let revenue = 0;
    let free = 0;
    for (const s of xs) {
      const first = preBuysOf(s)[0];
      if (first) {
        paid += 1;
        revenue += first[1];
        if (arm === "choose") {
          // A sale with no pick recorded is counted as the reader's own amount: the page sends
          // a pick with every price, so only a missing payment row's metadata could do this.
          const option = options.get(choices.get(s.id) ?? "custom") ?? options.get("custom")!;
          option.n += 1;
          option.revenue += first[1];
        }
      } else if (arm === "choose" && choices.get(s.id) === "free") {
        free += 1;
      }
    }
    return {
      arm,
      name,
      sub,
      control: arm === "fixed",
      finishers: xs.length,
      reached: seen ? xs.filter((s) => seen.has(s.id)).length : null,
      paid,
      revenue,
      free,
      full: xs.filter((s) => s.full).length,
    };
  });
  const [a, b] = arms as [PriceTestArm, PriceTestArm];
  return {
    test: PRICE_TEST_NAME,
    arms,
    options: [...options.values()],
    verdict: readout(a, b),
    why: null,
  };
}
