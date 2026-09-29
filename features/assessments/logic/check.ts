import { checkCopy, readingGrade } from "@features/brain/server/copy-gate";

import { bandOf, itemValue, optionsOf, reviewHash, scoredItems, scoreRange } from "./score";
import { standardSignOff } from "./signoff";
import type { InstrumentDefinition } from "./types";

/**
 * THE FACTORY'S AUTOMATED GATE: everything about an instrument that code can check, so the
 * people who validate it (Mark and Sanjin) spend their time on what only people can judge:
 * whether the wording is the source's, whether the bands are the manual's, whether the copy
 * is right for someone who just scored "severe".
 *
 * An instrument with a problem here cannot be validated, and `validated` also needs every
 * standard sign-off line signed and dated against what is there now (`signedHash`). The
 * test suite runs this over every instrument file, so a definition that breaks a rule fails
 * the build.
 */

export interface Problem {
  /** "bands", "items", "license", "copy", ... */
  area: string;
  message: string;
}

/**
 * Claims that turn a screening result into a diagnosis. Our copy never makes them. Saying
 * what the result is NOT ("a screen, not a diagnosis", "only a doctor can diagnose") is
 * the point of the disclaimer, so the bare word is not flagged, only the claims.
 */
const DIAGNOSTIC: RegExp[] = [
  /\byou (?:have|'ve got) (?:\w+ ){0,2}(?:anxiety|depression|disorder|gad|mdd|ptsd|illness)\b/i,
  /\byou(?:'re| are) (?:\w+ )?(?:depressed|anxious|lonely|mentally ill)\b/i,
  /\byou(?:'re| are) (?:\w+ )?suffering\b/i,
  /\bsuffer(?:s|ing)? from\b/i,
  /\bdiagnosed with\b/i,
  /\b(?:is|means) (?:a|your) diagnosis\b/i,
  /\bdisorder\b/i,
];
/** Copy Gate findings that apply to short copy (the rest are about report chapters). */
const COPY_KINDS = new Set(["em-dash", "ai-phrase", "absolute"]);
/** The Copy Gate's own reading target, applied here to copy of any length. */
const TARGET_GRADE = 8;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (d: string | undefined) =>
  !!d && ISO_DAY.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Every total a person can actually get (reversed items flipped), so coverage is exact. */
export function reachableTotals(def: InstrumentDefinition): number[] {
  const scored = scoredItems(def);
  let sums = new Set<number>([0]);
  for (const item of scored) {
    const next = new Set<number>();
    for (const s of sums) {
      for (const o of optionsOf(def, item)) next.add(s + itemValue(def, item, o.value));
    }
    sums = next;
  }
  const totals = [...sums].map((s) => (def.scoring.method === "sum" ? s : s / scored.length));
  return [...new Set(totals)].sort((a, b) => a - b);
}

/** The problems in one piece of our copy, labelled with where it sits. */
function copyProblems(where: string, text: string): string[] {
  if (!text.trim()) return [`${where} is empty`];
  const out: string[] = [];
  if (DIAGNOSTIC.some((re) => re.test(text))) out.push(`${where} reads as a diagnosis`);
  for (const f of checkCopy({ text }).findings) {
    // Warnings too: this copy is a sentence or two, and it has to be clean.
    if (COPY_KINDS.has(f.kind)) out.push(`${where}: ${f.message}`);
  }
  const grade = readingGrade(text);
  if (grade > TARGET_GRADE) {
    out.push(`${where} reads at school grade ${grade.toFixed(1)}; the target is ${TARGET_GRADE}`);
  }
  return out;
}

export function checkInstrument(def: InstrumentDefinition): Problem[] {
  const out: Problem[] = [];
  const add = (area: string, message: string) => out.push({ area, message });

  // Items and answers.
  const ids = def.items.map((i) => i.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) add("items", `item ids repeat: ${[...new Set(dup)].join(", ")}`);
  if (!scoredItems(def).length) add("items", "no item is scored");
  for (const item of def.items) {
    if (!item.text.trim()) add("items", `${item.id} has no wording`);
    const values = optionsOf(def, item).map((o) => o.value);
    if (values.length < 2) add("items", `${item.id} has fewer than two answers to choose from`);
    if (new Set(values).size !== values.length) add("items", `${item.id} repeats an answer value`);
    if (values.some((v) => !Number.isInteger(v))) {
      add("items", `${item.id} has a non-whole answer value`);
    }
    if (optionsOf(def, item).some((o) => !o.label.trim())) {
      add("items", `${item.id} has an unlabelled answer`);
    }
    // Reversing flips each answer to min + max - value; on an uneven set of values that
    // lands on values that are not answers at all.
    if (
      item.reverse &&
      values.some((v) => !values.includes(Math.min(...values) + Math.max(...values) - v))
    ) {
      add("items", `${item.id} is reversed, but its answer values are not symmetric`);
    }
  }

  // Bands: every reachable total in exactly one band, no band that nobody can reach.
  const totals = reachableTotals(def);
  for (const t of totals) {
    const holding = def.bands.filter((b) => t >= b.min && t <= b.max);
    if (holding.length === 0) add("bands", `a total of ${t} falls in no band`);
    if (holding.length > 1) {
      add("bands", `a total of ${t} falls in ${holding.map((b) => b.label).join(" and ")}`);
    }
  }
  for (const b of def.bands) {
    if (b.min > b.max) add("bands", `${b.label} runs backwards (${b.min} to ${b.max})`);
    if (!totals.some((t) => t >= b.min && t <= b.max)) add("bands", `nobody can score ${b.label}`);
  }
  const [lo, hi] = scoreRange(def);
  if (totals[0] !== lo || totals.at(-1) !== hi) add("bands", "the score range does not add up");
  if (totals.some((t) => bandOf(def, t) === undefined)) {
    add("bands", "the scorer would fail on a reachable total");
  }

  // Safety.
  for (const rule of def.safety ?? []) {
    const item = def.items.find((i) => i.id === rule.item);
    if (!item) {
      add("safety", `a safety rule watches ${rule.item}, which is not an item`);
      continue;
    }
    const values = optionsOf(def, item).map((o) => o.value);
    if (!values.some((v) => v >= rule.atLeast)) {
      add("safety", `the safety rule on ${rule.item} can never trigger`);
    }
    if (rule.atLeast <= Math.min(...values)) {
      add("safety", `the safety rule on ${rule.item} triggers on every answer`);
    }
    for (const p of copyProblems(`the safety message on ${rule.item}`, rule.message))
      add("safety", p);
    for (const p of copyProblems(`the safety next step on ${rule.item}`, rule.nextStep))
      add("safety", p);
    if (!rule.resources.some((r) => r.region === "ANY" && r.lines.length)) {
      add("safety", `the safety rule on ${rule.item} has no help for everywhere else (ANY)`);
    }
    for (const r of rule.resources) {
      if (!r.lines.length)
        add("safety", `the safety rule on ${rule.item} lists no help for ${r.region}`);
    }
  }

  // Sources and permission.
  if (!def.citations.length) add("license", "no source is cited");
  if (!def.license.source.trim()) add("license", "the license terms have no source");
  if (def.license.kind === "attribution" && !def.license.attribution?.trim()) {
    add("license", "the license needs a credit line, and none is given");
  }
  if (def.license.kind === "unknown" && def.status !== "draft") {
    add("license", `the license is unchecked, so it must stay a draft (it is ${def.status})`);
  }
  if (!def.form.url.trim() || !realDay(def.form.retrieved)) {
    add("license", "the published form needs a url and the day it was read (YYYY-MM-DD)");
  }

  // Our copy: screening language, and the rules Mark set for report copy.
  for (const b of def.bands) {
    for (const p of copyProblems(`${b.label}: the summary`, b.summary)) add("copy", p);
    for (const p of copyProblems(`${b.label}: the next step`, b.nextStep)) add("copy", p);
  }

  // Status. Validated means the standard lines, each signed and dated, against this source.
  if (def.status === "validated") {
    const expected = standardSignOff(def).map((s) => s.check);
    const got = def.signOff.map((s) => s.check);
    if (JSON.stringify(expected) !== JSON.stringify(got)) {
      add("status", "validated, but the sign-off lines are not the standard ones");
    }
    const unsigned = def.signOff.filter((s) => !s.by?.trim() || !realDay(s.on));
    if (unsigned.length) {
      add("status", `validated, but ${unsigned.length} sign-off line(s) are unsigned or undated`);
    }
    if (def.signedHash !== reviewHash(def)) {
      add("status", "validated, but it changed after it was signed: sign it again");
    }
    if (def.license.kind === "permission" && !def.license.granted?.trim()) {
      add("status", "validated with a permission license, but nobody recorded the permission");
    }
  }
  return out;
}
