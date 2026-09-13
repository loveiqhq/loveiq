import { z } from "zod";

import { SURVEY_SELECTION_CAPS } from "./utils";

/**
 * Validation for the `answers` map of a survey submission.
 *
 * Lives here rather than inline in `app/api/survey/route.ts` because Next.js rejects
 * arbitrary exports from a route module, and a validation rule that cannot be tested
 * directly is a rule nobody notices breaking.
 *
 * Keys are question ids (numeric, no more than ~12 chars). Key length AND key count are
 * bounded so an oversized junk-key body cannot bloat downstream JSONB. [Audit L1]
 */
export const surveyAnswersSchema = z
  .record(
    z.string().min(1).max(16),
    z.union([
      z.string().max(1000),
      z.array(z.string().max(500)).max(20),
      z.number().int().min(1).max(7),
    ])
  )
  .refine((obj) => Object.keys(obj).length <= 200, { message: "Too many answers" })
  // Enforce the per-question selection cap the UI already enforces. Without this the cap
  // is a client-side courtesy: a modified client could send twenty picks for a question
  // capped at two, and the ranking those answers feed would be quietly corrupted by rows
  // nobody could pick out afterwards.
  .superRefine((obj, ctx) => {
    for (const [qId, value] of Object.entries(obj)) {
      const cap = SURVEY_SELECTION_CAPS.get(qId);
      if (cap === undefined || !Array.isArray(value) || value.length <= cap) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [qId],
        message: `At most ${cap} selections allowed`,
      });
    }
  });
