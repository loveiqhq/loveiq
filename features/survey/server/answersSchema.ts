import { z } from "zod";

import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { SURVEY_SELECTION_CAPS } from "./utils";

const SCALE_QIDS = new Set(
  surveyQuestions.filter((q) => q.answerType === "scale").map((q) => q.qId)
);

/**
 * Validation for the `answers` map of a survey submission.
 *
 * Lives here rather than inline in `app/api/survey/route.ts` because Next.js rejects
 * arbitrary exports from a route module, and a validation rule that cannot be tested
 * directly is a rule nobody notices breaking.
 *
 * Keys are question ids (numeric, no more than ~12 chars). Key length AND key count are
 * bounded so an oversized junk-key body cannot bloat downstream JSONB. [Audit L1]
 *
 * Everything else a real browser can have stored is brought within bounds, never
 * refused. At the final submit a 400 is a dead end: Retry resends the same stored
 * payload and only Start Over, which discards every answer, gets the reader out. Four
 * readers lost their report that way in September 2026. So:
 * - text over 1000 characters is cut (the "Other" box had no limit);
 * - a pick list over its question's cap keeps its first picks (a draft saved before the
 *   cap went live, or a page left open across that deploy);
 * - answers to questions hidden since are dropped (an old draft still carries them);
 * - a scale answer that is not a number is dropped (two questions were text once, and
 *   submit_survey casts scale answers to numeric, which failed every retry).
 */
export const surveyAnswersSchema = z
  .record(
    z.string().min(1).max(16),
    z.union([
      z
        .string()
        .max(20_000)
        .transform((s) => s.slice(0, 1000)),
      z
        .array(
          z
            .string()
            .max(2_000)
            .transform((s) => s.slice(0, 500))
        )
        .max(100),
      z.number().int().min(1).max(7),
    ])
  )
  .refine((obj) => Object.keys(obj).length <= 200, { message: "Too many answers" })
  .transform((obj) => {
    // Rebuilt from entries, so a key like "__proto__" stays a plain own property.
    const tidied = new Map<string, string | string[] | number>();
    for (const [key, value] of Object.entries(obj)) {
      const qId = key.endsWith("_other") ? key.slice(0, -"_other".length) : key;
      if (isHidden(qId)) continue;
      if (SCALE_QIDS.has(key) && typeof value !== "number") continue;
      tidied.set(
        key,
        Array.isArray(value) ? value.slice(0, SURVEY_SELECTION_CAPS.get(key) ?? 20) : value
      );
    }
    return Object.fromEntries(tidied);
  });
