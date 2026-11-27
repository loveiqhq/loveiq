import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  TINY_ARM,
  twoProportionSignal,
} from "@features/admin/server/statistics";
import { isPayToStartTracker } from "@features/pay-to-start/logic/journey";
import {
  CHOOSE_PRICE_CUSTOM_MIN_CENTS,
  isChoosePriceOption,
  tileCents,
  type ChoosePriceOption,
} from "@features/report/logic/choosePrice";
import { GATE_CHOOSE_COPY } from "@features/report/ui/gate/gateChoosePriceContent";
import { GATE_REVEAL_ARM_KEY } from "@shared/experiments/gateRevealArm";
import { isGatePriceArm, type GatePriceArm } from "@shared/experiments/gatePriceArm";
import { reportingDayStart } from "@shared/time/reporting-day";

import { fetchAllRows } from "../supabase";
import { addDays } from "./days";
import { preBuysOf, type SubFact } from "./facts";
import { fmt } from "./format";

/**
 * AP-Analytics, Payment · the pre-unlock price test (Marcus's board "Assessment A · Payment
 * copy", 24 Nov 2026; shared/experiments/gatePriceArm.ts): half the free finishers meet today's
 * EUR 1.99 page, half the "Choose your price" page, where they pick EUR 1.99 (since 27 Nov, in
 * the EUR 0 tile's place), 6.99, 19.99 or their own amount for the same pre-unlock; EUR 0 is
 * still theirs, as an own amount of 0 they confirm. It replaced #11 (the Core Archetype shown),
 * and its section took #11's place on the page.
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

/**
 * The first day a survey can carry the test's stamp: its switch went on in production at 20:23
 * Berlin on 26 Nov 2026 (registry #13), and only a survey submitted while it is on is stamped.
 * Its reads start here.
 */
export const GATE_PRICE_FROM = "2026-11-26";

/** The section's title, as the board names it. */
export const PRICE_TEST_NAME = "Pre-unlock price test: €1.99 vs choose your price";

const centsOf = tileCents;

const euros = (cents: number) => fmt("eur", cents / 100);

/** Each half as the board names it; today's page is the control. */
const ARMS: ReadonlyArray<{ arm: GatePriceArm; name: string; sub: string }> = [
  { arm: "fixed", name: "A · Fixed €1.99", sub: "Control: today’s page" },
  { arm: "choose", name: "B · Choose your price", sub: `Suggested ${euros(centsOf("fair"))}` },
];

/**
 * The choosing half's picks with a price, in the page's order, named as the board names them
 * ("Fair price · €6.99", recommended) with this page's amounts: its EUR 19.99 tile and its
 * own amount's floor, where the board's sample drew EUR 12.99 and "from €1". The EUR 1.99 tile
 * (Marcus's hotfix of 27 Nov) goes by its own words, "If money is tight".
 */
const PAID_OPTIONS: ReadonlyArray<{ option: ChoosePriceOption; name: string; sub: string }> = [
  {
    option: "tight",
    name: `${GATE_CHOOSE_COPY.card.notes.tight} · ${euros(centsOf("tight"))}`,
    sub: "",
  },
  {
    option: "fair",
    name: `Fair price · ${euros(centsOf("fair"))}`,
    sub: GATE_CHOOSE_COPY.card.notes.fair.toLowerCase(),
  },
  {
    option: "support",
    name: `${GATE_CHOOSE_COPY.card.notes.support} · ${euros(centsOf("support"))}`,
    sub: "",
  },
  {
    option: "custom",
    name: `Own amount · from ${euros(CHOOSE_PRICE_CUSTOM_MIN_CENTS)}`,
    sub: "avg. of what they typed",
  },
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
 * The surveys finished from `from` (never before GATE_PRICE_FROM), up to the end of `to` when
 * given, with their tracker: each one's half and pay-to-start label. Null when the read fails.
 */
export async function readPriceTestRows(from: string, to?: string): Promise<PriceTestRow[] | null> {
  const until = to
    ? `&created_date_time=lt.${encodeURIComponent(reportingDayStart(addDays(to, 1)).toISOString())}`
    : "";
  const rows = await fetchAllRows<PriceTestRow>(
    "/rest/v1/survey_submission?status=eq.completed" +
      `&created_date_time=gte.${readsFrom(from)}${until}` +
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
 * The readout in the board's words: each half's revenue per free finisher, the pay rates and the
 * free claims; whether the pay rates can be compared yet, by the shared A/B readouts' rules (too
 * few in all, a half under TINY_ARM, too few payments, no clear winner, or a gap the test
 * supports); what to watch; and, until it is met, the board's bar for calling the test: at least
 * MIN_CELL_COUNT paying readers on every price in both halves (the EUR 1.99, and each pick).
 */
function readout(a: PriceTestArm, b: PriceTestArm, options: readonly PriceTestOption[]): string {
  if (a.finishers === 0 && b.finishers === 0) return "No data yet.";
  if (a.finishers === 0 || b.finishers === 0) {
    const only = a.finishers > 0 ? a : b;
    return `Only ${only.name} has data, so there is nothing to compare against.`;
  }
  const perFinisher = (h: PriceTestArm) => fmt("eur", h.revenue / h.finishers, 2);
  const rate = (h: PriceTestArm) => h.paid / h.finishers;
  const than = rate(b) > rate(a) ? "a higher" : rate(b) < rate(a) ? "a lower" : "the same";
  const claims = `${fmt("count", b.free)} free ${b.free === 1 ? "claim" : "claims"}`;
  const lead = `Choose your price earns ${perFinisher(b)} per finisher against ${perFinisher(a)}, with ${than} pay rate (${fmt("pct", rate(b))} vs ${fmt("pct", rate(a))}) and ${claims}.`;
  const watch =
    " Watch the free claims and the share choosing the lowest amounts: if they grow, the average price falls.";
  const bar =
    Math.min(a.paid, ...options.map((o) => o.n)) < MIN_CELL_COUNT
      ? ` To call it, each arm needs at least ${MIN_CELL_COUNT} paying readers per price option.`
      : "";

  const smallest = Math.min(a.finishers, b.finishers);
  if (a.finishers + b.finishers < 50 || smallest < TINY_ARM) {
    return `${lead} Too early to call: the smaller half has ${fmt("count", smallest)} free ${smallest === 1 ? "finisher" : "finishers"}, so treat any gap as noise for now.${watch}${bar}`;
  }
  const signal = twoProportionSignal(a.finishers, a.paid, b.finishers, b.paid);
  const pays =
    signal.significance === "inconclusive"
      ? " The pay rates could still differ by chance."
      : signal.significance !== "insufficient-data"
        ? ` The pay-rate gap is real (${formatSignalSummary(signal)}).`
        : // Under five payers in a half, the bar below says so; this covers five who didn't.
          bar
          ? ""
          : ` The pay rates can't be compared yet: each half needs at least ${MIN_CELL_COUNT} who paid and ${MIN_CELL_COUNT} who didn't.`;
  return `${lead}${pays}${watch}${bar}`;
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
      "Not running in this range: the test starts with its switch, from 26 Nov 2026. Pick a range that reaches it."
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
  const picks = [...options.values()];
  return {
    test: PRICE_TEST_NAME,
    arms,
    options: picks,
    verdict: readout(a, b, picks),
    why: null,
  };
}
