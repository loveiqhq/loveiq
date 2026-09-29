import { createHash } from "node:crypto";

import type {
  Band,
  HelpLines,
  InstrumentDefinition,
  Item,
  ResponseOption,
  SafetyRule,
} from "./types";

/**
 * Scores any instrument in the factory the way its manual does: reverse items flipped on
 * their own scale, the scored items summed or averaged, the total placed in its band. Safety
 * rules are checked on the raw answers, before anything else, and are reported whatever the
 * total is: one answer can matter more than the score.
 */

export type Answers = Record<string, number>;

/**
 * `safety` is on BOTH outcomes: a sheet with a question left out must still route a person
 * who answered the safety item to help. A caller that only reads the error path would
 * otherwise show "please answer every question" to someone at risk. On a scored sheet,
 * `nextStep` is the band's unless a safety rule triggered, in which case it is the rule's:
 * "you can carry on as you are" must never sit beside a crisis message.
 */
export type Scored =
  | { ok: true; total: number; band: Band; nextStep: string; safety: SafetyRule[] }
  | { ok: false; missing: string[]; invalid: string[]; safety: SafetyRule[] };

export const optionsOf = (def: InstrumentDefinition, item: Item): ResponseOption[] =>
  item.options ?? def.scale;

export const scoredItems = (def: InstrumentDefinition) => def.items.filter((i) => !i.unscored);

/** An answer as it counts towards the total: reversed items flipped on their own scale. */
export function itemValue(def: InstrumentDefinition, item: Item, answer: number): number {
  if (!item.reverse) return answer;
  const values = optionsOf(def, item).map((o) => o.value);
  return Math.min(...values) + Math.max(...values) - answer;
}

/** The lowest and highest total the scored items allow. */
export function scoreRange(def: InstrumentDefinition): [number, number] {
  const items = scoredItems(def);
  const lows = items.map((i) => Math.min(...optionsOf(def, i).map((o) => o.value)));
  const highs = items.map((i) => Math.max(...optionsOf(def, i).map((o) => o.value)));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return def.scoring.method === "sum"
    ? [sum(lows), sum(highs)]
    : [sum(lows) / items.length, sum(highs) / items.length];
}

/** The band a total falls in, compared exactly: a mean of 1.995 is not rounded across a cutoff. */
export function bandOf(def: InstrumentDefinition, total: number): Band | undefined {
  return def.bands.find((b) => total >= b.min && total <= b.max);
}

export function scoreInstrument(def: InstrumentDefinition, answers: Answers): Scored {
  // First, on the raw answers, whatever else is wrong with the sheet. An answer that is not
  // one of the options still counts here: when unsure, show the help.
  const safety = (def.safety ?? []).filter(
    (r) => Number(answers[r.item] ?? -Infinity) >= r.atLeast
  );
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const item of def.items) {
    const a = answers[item.id];
    if (a === undefined) {
      if (!item.unscored) missing.push(item.id);
      continue;
    }
    if (!optionsOf(def, item).some((o) => o.value === a)) invalid.push(item.id);
  }
  // A key that is no item of this instrument is a caller's mistake, not something to ignore.
  const known = new Set(def.items.map((i) => i.id));
  invalid.push(...Object.keys(answers).filter((k) => !known.has(k)));
  if (missing.length || invalid.length) return { ok: false, missing, invalid, safety };

  const values = scoredItems(def).map((i) => itemValue(def, i, answers[i.id]!));
  const sum = values.reduce((a, b) => a + b, 0);
  const exact = def.scoring.method === "sum" ? sum : sum / values.length;
  const band = bandOf(def, exact);
  // The factory's check guarantees the bands cover every reachable total, so this is a
  // definition bug, and a loud one.
  if (!band) throw new Error(`${def.id}: no band holds a total of ${exact}`);
  // Rounded for display only; the band was chosen on the exact value.
  const total = def.scoring.method === "sum" ? exact : Math.round(exact * 100) / 100;
  return { ok: true, total, band, nextStep: safety[0]?.nextStep ?? band.nextStep, safety };
}

/** The help lines for a person in `country` (ISO 3166 alpha-2), or the `ANY` lines. */
export function helpFor(rule: SafetyRule, country: string | null | undefined): HelpLines {
  const code = (country ?? "").toUpperCase();
  return (
    rule.resources.find((r) => r.region === code) ??
    rule.resources.find((r) => r.region === "ANY") ?? { region: "ANY", lines: [] }
  );
}

/**
 * A fingerprint of everything a reviewer signs as faithful to the source: the form, the
 * instructions, every item's wording and answers, the scoring, and the band ranges and
 * labels. Our copy (summaries, next steps, safety wording) is not in it: rewording that is
 * reviewed on its own lines, and should not throw away the fidelity sign-off.
 */
export function sourceHash(def: InstrumentDefinition): string {
  const source = {
    form: def.form,
    instructions: def.instructions,
    scale: def.scale,
    items: def.items.map((i) => ({
      id: i.id,
      text: i.text,
      reverse: !!i.reverse,
      unscored: !!i.unscored,
      options: i.options ?? null,
    })),
    scoring: def.scoring,
    bands: def.bands.map((b) => ({ min: b.min, max: b.max, label: b.label })),
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 16);
}
