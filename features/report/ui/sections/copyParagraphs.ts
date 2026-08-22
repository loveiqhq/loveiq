/**
 * A line break typed into the copy sheet, rendered as a PARAGRAPH break.
 *
 * The report renders copy with `white-space: pre-line`, so a newline already shows as a
 * line break. In the chapter body blocks a break means "start a new paragraph" (MO,
 * 2026-08-21: "one blob of text that might be better structured into 2 paragraphs"), so
 * any run of newlines is normalised to one blank line — which `pre-line` draws as a
 * paragraph-sized gap.
 *
 * Why not split into separate <p> elements: these blocks sit in flex columns whose
 * row-gap differs per chapter, so sibling paragraphs would be spaced differently in
 * every chapter — the thing we just finished standardising.
 *
 * Why normalise rather than require a blank line: `gen_handoff.py` and
 * `copy-matrix-v2.csv` live outside this repo, so whether a blank line typed into a
 * cell survives into `report2-copy.ts` cannot be verified here. A single newline
 * provably does (the "• " lists in `edu.body.p2/p3` arrive that way), so one break is
 * enough.
 */
export function copyParagraphs(text: string): string {
  return text.split(/\n+/).join("\n\n");
}
