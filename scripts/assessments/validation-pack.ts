/**
 * The validation pack: one instrument laid out for the people who sign it off (Mark and
 * Sanjin), with the source's words and ours kept apart, what the automated gate already
 * checked, and the lines they sign.
 *
 *   npx tsx scripts/assessments/validation-pack.ts gad7          # one instrument, to stdout
 *   npx tsx scripts/assessments/validation-pack.ts --all > pack.md
 *
 * Not committed as docs: the definitions are the source of truth, and a copy of them in
 * Markdown would drift. Generate it when a review starts.
 */
import { INSTRUMENTS, instrument } from "@features/assessments/instruments";
import { checkInstrument } from "@features/assessments/logic/check";
import { optionsOf, reviewHash, scoreRange } from "@features/assessments/logic/score";
import type { InstrumentDefinition } from "@features/assessments/logic/types";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function validationPack(def: InstrumentDefinition): string {
  const [lo, hi] = scoreRange(def);
  const problems = checkInstrument(def);
  const lines = [
    `# ${def.shortName}: ${def.name}`,
    "",
    `Version ${def.version}, status **${def.status}**. Measures ${def.construct} ` +
      `(Humangraph: ${def.humangraph}). For screening, never diagnosis.`,
    "",
    "Wording marked **source** must match the cited source word for word. Wording marked " +
      "**ours** is LoveIQ's copy, reviewed for accuracy and tone.",
    "",
    "## Source and license",
    "",
    `- Published form: ${def.form.title}, ${def.form.url} (read ${def.form.retrieved}).` +
      (def.form.adaptation ? ` **Adapted:** ${def.form.adaptation}` : ""),
    ...def.citations.map(
      (c) => `- ${c.text}${c.doi ? ` https://doi.org/${c.doi}` : ""}${c.url ? ` ${c.url}` : ""}`
    ),
    `- License: **${def.license.kind}**. ${def.license.terms} (${def.license.source})` +
      (def.license.attribution ? ` Credit line: "${def.license.attribution}".` : ""),
    "",
    "## What a person sees (source)",
    "",
    `Instructions: "${def.instructions}"`,
    "",
    "| Item | Wording | Scored |",
    "| --- | --- | --- |",
    ...def.items.map(
      (i) =>
        `| ${i.id} | ${cell(i.text)} | ${i.unscored ? "no" : i.reverse ? "yes, reversed" : "yes"} |`
    ),
    "",
    "Answers: " + def.scale.map((o) => `${o.value} = ${o.label}`).join(", ") + ".",
    ...def.items
      .filter((i) => i.options)
      .map(
        (i) =>
          `${i.id} answers: ${optionsOf(def, i)
            .map((o) => `${o.value} = ${o.label}`)
            .join(", ")}.`
      ),
    "",
    "## Scoring (source)",
    "",
    `The ${def.scoring.method} of the scored items, from ${lo} to ${hi}.`,
    "",
    `| Total | Label (${def.bandsFrom}) | Summary (ours) | Next step (ours) |`,
    "| --- | --- | --- | --- |",
    ...def.bands.map(
      (b) => `| ${b.min} to ${b.max} | ${b.label} | ${cell(b.summary)} | ${cell(b.nextStep)} |`
    ),
    "",
    "## Safety (ours)",
    "",
    ...(def.safety?.length
      ? def.safety.flatMap((r) => [
          `- When ${r.item} is answered ${r.atLeast} or higher, this shows at once, before the score and whatever it is:`,
          `  "${r.message}"`,
          `  Its next step replaces the band's: "${r.nextStep}"`,
          "  Where to get help, by the person's country:",
          ...r.resources.map((h) => `  - ${h.region}: ${h.lines.join("; ")}`),
        ])
      : ["No item in this instrument triggers safety routing."]),
    "",
    "## What the automated gate checked",
    "",
    "Every reachable total falls in exactly one band; every item has wording and at least two " +
      "answers; safety rules point at real items and can trigger; a source and license are " +
      "given; our copy passes the Copy Gate (no dashes, no machine phrasing, no absolute " +
      "claims, plain reading level) and never reads as a diagnosis.",
    "",
    problems.length
      ? `**Open problems (${problems.length}):**\n\n${problems.map((p) => `- ${p.area}: ${p.message}`).join("\n")}`
      : "**Result: all checks pass.**",
    "",
    "## Sign-off (Mark and Sanjin)",
    "",
    "Tick each line, with your name and the date (YYYY-MM-DD). The instrument can only be " +
      "marked validated when every line is signed, and when `signedHash` in its definition " +
      `is set to this version's fingerprint, **${reviewHash(def)}**. Any later change to ` +
      "what these lines cover, our copy and the safety routing included, changes the " +
      "fingerprint and needs a new sign-off.",
    "",
    ...def.signOff.map(
      (s) =>
        `- [${s.by && s.on ? "x" : " "}] ${s.check}${s.by ? ` (${s.by}, ${s.on ?? "no date"})` : ""}${s.note ? `. ${s.note}` : ""}`
    ),
  ];
  return lines.join("\n") + "\n";
}

if (process.argv[1]?.endsWith("validation-pack.ts")) {
  const arg = process.argv[2];
  const defs = arg === "--all" ? INSTRUMENTS : arg ? [instrument(arg)] : [];
  if (!defs.length || defs.some((d) => !d)) {
    console.error(
      `Usage: validation-pack.ts <id>|--all. Instruments: ${INSTRUMENTS.map((d) => d.id).join(", ")}`
    );
    process.exit(2);
  }
  console.log(defs.map((d) => validationPack(d!)).join("\n---\n\n"));
}
