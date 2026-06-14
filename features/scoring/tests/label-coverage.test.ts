import { describe, it, expect } from "vitest";
import { getScoringConfig } from "@features/scoring/logic/config";
import { surveyQuestions } from "@/data/survey-data";

/**
 * Regression guard for the 2026-05-19 V3 content drift (see
 * project-survey-content-drift): the survey reworded option labels but the
 * scoring workbook (labelToCodeMap) kept older labels for Q14020 + Q15005, so
 * those answers silently scored as nothing. This asserts the inverse invariant
 * to the DB-side `npm run survey:check-db-sync`: EVERY scored single/multiple
 * option label in survey-data.ts must resolve to a code via the same matching
 * the engine uses (exact normalized, dash-prefix, or startsWith fuzzy).
 *
 * Genuine opt-out options (Something else / Prefer not to answer / ...) are
 * intentionally absent from the scoring map and don't carry signal, so they're
 * exempt. Any OTHER unresolved label is real drift and fails the build.
 */

// Mirror of engine.ts normalizeLabel.
function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .replace(/–|—/g, "-")
    .replace(/\s+/g, " ");
}

// Mirror of engine.ts resolveAnswerValue string-resolution (exact → dash-prefix → startsWith).
function resolves(qidMap: Record<string, string>, raw: string): boolean {
  const n = normalizeLabel(raw);
  if (qidMap[n]) return true;
  const dashIdx = n.indexOf(" - ");
  if (dashIdx >= 0 && qidMap[n.slice(0, dashIdx).trim()]) return true;
  for (const key of Object.keys(qidMap)) if (n.startsWith(key)) return true;
  return false;
}

// Opt-out / "escape hatch" options that legitimately carry no scoring signal and
// so are not present in the scoring map. Matched on the normalized label.
const OPT_OUT_LABELS = new Set([
  "prefer not to answer",
  "something else",
  "other",
  "none of these",
  "not sure",
  "not sure yet",
  "i don't use a label",
  "i'd rather not label this",
]);

describe("scoring label coverage (V3 drift guard)", () => {
  const config = getScoringConfig();

  it("every scored single/multiple survey option resolves to a code", () => {
    const unresolved: string[] = [];
    for (const q of surveyQuestions) {
      if (q.answerType !== "single" && q.answerType !== "multiple") continue;
      const qidMap = config.labelToCode[q.qId];
      if (!qidMap || Object.keys(qidMap).length === 0) continue; // question not scored
      for (const opt of q.options ?? []) {
        if (resolves(qidMap, opt)) continue;
        if (OPT_OUT_LABELS.has(normalizeLabel(opt))) continue; // intentional non-scoring option
        unresolved.push(`${q.qId}: "${opt}"`);
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("Q14020 V3 labels resolve via the alias bridge", () => {
    const qidMap = config.labelToCode["14020"];
    expect(qidMap).toBeDefined();
    expect(qidMap[normalizeLabel("Feeling emotionally close to the other person")]).toBeTruthy();
    expect(qidMap[normalizeLabel("Pleasing or taking care of the other person")]).toBeTruthy();
    expect(qidMap[normalizeLabel("Comfort, soothing, or stress relief")]).toBeTruthy();
  });
});
