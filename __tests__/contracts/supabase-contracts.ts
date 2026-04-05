/**
 * Supabase API contract schemas.
 *
 * Each schema mirrors the exact shape of a real Supabase response that the
 * application code casts with `as`. Keeping these in sync with source code
 * prevents silent drift between mock data used in unit tests and the actual
 * database responses.
 *
 * Source references (route files that cast these shapes):
 *   - lib/ratelimit.ts          → RateLimitResponseSchema, CooldownResponseSchema
 *   - app/api/waitlist/route.ts → WaitlistIdempotencyResponseSchema, WaitlistInsertResponseSchema
 *   - app/api/survey/route.ts   → SurveySubmitResponseSchema
 *   - app/api/admin/stats/route.ts
 *       → BehaviorStatsResponseSchema, AnswerDistributionResponseSchema, WaitlistStatsResponseSchema
 *   - app/api/admin/submissions/route.ts → SubmissionListResponseSchema
 *   - app/api/admin/submissions/[id]/route.ts
 *       → SubmissionDetailResponseSchema, AnswerDetailResponseSchema
 *   - app/api/admin/export/route.ts → ExportAnswerResponseSchema
 *   - app/api/admin/survey-status/route.ts → SurveyStatusResponseSchema
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// 1. RateLimitResponseSchema
//    Source: lib/ratelimit.ts — RPC `check_rate_limit` response
//    Code:   result.allowed, result.remaining, result.reset_at
// ---------------------------------------------------------------------------
export const RateLimitResponseSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number(),
  reset_at: z.number(),
});

// ---------------------------------------------------------------------------
// 2. CooldownResponseSchema
//    Source: lib/ratelimit.ts — `rate_limits` SELECT ?select=updated_at
//    Code:   (await getResponse.json()) as Array<{ updated_at: string }>
// ---------------------------------------------------------------------------
export const CooldownResponseSchema = z.array(
  z.object({
    updated_at: z.string(),
  })
);

// ---------------------------------------------------------------------------
// 3. WaitlistIdempotencyResponseSchema
//    Source: app/api/waitlist/route.ts — SELECT id for duplicate check
//    Code:   (await existingRes.json()) as Array<{ id: string }>
// ---------------------------------------------------------------------------
export const WaitlistIdempotencyResponseSchema = z.array(
  z.object({
    id: z.string(),
  })
);

// ---------------------------------------------------------------------------
// 4. WaitlistInsertResponseSchema
//    Source: app/api/waitlist/route.ts — INSERT with Prefer: return=representation
//    Code:   [{ id: "new-id" }] (the route only checks array length / circuit)
//    The real Supabase insert representation returns the inserted row.
// ---------------------------------------------------------------------------
export const WaitlistInsertResponseSchema = z.array(
  z.object({
    id: z.number(),
    email: z.string(),
    source: z.string(),
    created_date_time: z.string(),
  })
);

// ---------------------------------------------------------------------------
// 5. SurveySubmitResponseSchema
//    Source: app/api/survey/route.ts — RPC `submit_survey`
//    Code:   rpcResult?.success === false / rpcResult.error
// ---------------------------------------------------------------------------
export const SurveySubmitResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 6. BehaviorStatsResponseSchema
//    Source: app/api/admin/stats/route.ts — RPC `get_behavior_stats`
//    Code:   behaviorData.dropOff, behaviorData.avgTimePerQuestion,
//            behaviorData.funnel, behaviorData.chapterDropOff,
//            behaviorData.backtrackRate, behaviorData.backtrackByQuestion,
//            behaviorData.chapterFunnel
// ---------------------------------------------------------------------------
export const BehaviorStatsResponseSchema = z.object({
  dropOff: z.array(
    z.object({
      q_id: z.string(),
      count: z.number(),
    })
  ),
  avgTimePerQuestion: z.array(
    z.object({
      q_id: z.string(),
      avg_ms: z.number(),
    })
  ),
  funnel: z.object({
    unique_sessions: z.number(),
    completed_sessions: z.number(),
    abandoned_sessions: z.number(),
  }),
  chapterDropOff: z.array(
    z.object({
      chapter: z.string(),
      count: z.number(),
    })
  ),
  backtrackRate: z.object({
    back_count: z.number(),
    forward_count: z.number(),
  }),
  backtrackByQuestion: z.array(
    z.object({
      q_id: z.string(),
      count: z.number(),
    })
  ),
  chapterFunnel: z.array(
    z.object({
      chapter: z.string(),
      sessions: z.number(),
    })
  ),
});

// ---------------------------------------------------------------------------
// 7. AnswerDistributionResponseSchema
//    Source: app/api/admin/stats/route.ts — RPC `get_answer_distribution`
//    Code:   distData.single, distData.multiple (each: q_id, option_text, count)
// ---------------------------------------------------------------------------
export const AnswerDistributionResponseSchema = z.object({
  single: z.array(
    z.object({
      q_id: z.string(),
      option_text: z.string(),
      count: z.number(),
    })
  ),
  multiple: z.array(
    z.object({
      q_id: z.string(),
      option_text: z.string(),
      count: z.number(),
    })
  ),
});

// ---------------------------------------------------------------------------
// 8. SubmissionListResponseSchema
//    Source: app/api/admin/submissions/route.ts — survey_submission SELECT with
//            embedded app_user + scoring_result joins
//    Code:   raw as Array<{ id, status, start_date_time, created_date_time,
//                           duration_ms, app_user, scoring_result }>
// ---------------------------------------------------------------------------
export const SubmissionListResponseSchema = z.array(
  z.object({
    id: z.number(),
    status: z.string(),
    start_date_time: z.string().nullable(),
    created_date_time: z.string(),
    duration_ms: z.number().nullable(),
    app_user: z
      .object({
        email: z.string(),
        first_name: z.string(),
      })
      .nullable(),
    scoring_result: z
      .object({
        primary_archetype: z.string(),
        v5_primary_archetype: z.string().nullable(),
        percentages: z.record(z.string(), z.number()).nullable(),
        v5_percentages: z.record(z.string(), z.number()).nullable(),
      })
      .nullable(),
  })
);

// ---------------------------------------------------------------------------
// 9. SubmissionDetailResponseSchema
//    Source: app/api/admin/submissions/[id]/route.ts — same SELECT shape as
//            submissions list but for a single record (returned as array by
//            PostgREST, route takes index 0)
// ---------------------------------------------------------------------------
export const SubmissionDetailResponseSchema = z.array(
  z.object({
    id: z.number(),
    status: z.string(),
    start_date_time: z.string().nullable(),
    created_date_time: z.string(),
    duration_ms: z.number().nullable(),
    app_user: z
      .object({
        email: z.string(),
        first_name: z.string(),
      })
      .nullable(),
  })
);

// ---------------------------------------------------------------------------
// 10. AnswerDetailResponseSchema
//     Source: app/api/admin/submissions/[id]/route.ts — survey_submission_answer
//             SELECT with question + option joins (used for detail view)
//     Code:   rawAnswers as Array<{ id, answer_text, answer_option_id,
//                                   normalized_value, answered_at,
//                                   survey_question, answer_option,
//                                   survey_submission_answer_options }>
// ---------------------------------------------------------------------------
export const AnswerDetailResponseSchema = z.array(
  z.object({
    id: z.number(),
    answer_text: z.string().nullable(),
    answer_option_id: z.number().nullable(),
    normalized_value: z.number().nullable(),
    answered_at: z.string().nullable(),
    survey_question: z
      .object({
        frontend_qid: z.string(),
        type: z.string(),
        question: z.string(),
      })
      .nullable(),
    answer_option: z
      .object({
        option_text: z.string(),
      })
      .nullable(),
    survey_submission_answer_options: z.array(
      z.object({
        answer_option: z
          .object({
            option_text: z.string(),
          })
          .nullable(),
      })
    ),
  })
);

// ---------------------------------------------------------------------------
// 11. ExportAnswerResponseSchema
//     Source: app/api/admin/export/route.ts — same join pattern as detail
//             but without id/answered_at and survey_question has no `question`
//     Code:   answers as Array<{ survey_submission_id, answer_text,
//                                answer_option_id, normalized_value,
//                                survey_question, answer_option,
//                                survey_submission_answer_options }>
// ---------------------------------------------------------------------------
export const ExportAnswerResponseSchema = z.array(
  z.object({
    survey_submission_id: z.number(),
    answer_text: z.string().nullable(),
    answer_option_id: z.number().nullable(),
    normalized_value: z.number().nullable(),
    survey_question: z
      .object({
        frontend_qid: z.string(),
        type: z.string(),
      })
      .nullable(),
    answer_option: z
      .object({
        option_text: z.string(),
      })
      .nullable(),
    survey_submission_answer_options: z.array(
      z.object({
        answer_option: z
          .object({
            option_text: z.string(),
          })
          .nullable(),
      })
    ),
  })
);

// ---------------------------------------------------------------------------
// 12. SurveyStatusResponseSchema
//     Source: app/api/admin/survey-status/route.ts — `survey` SELECT id,status
//     Code:   (await res.json()) as Array<{ id: number; status: string }>
// ---------------------------------------------------------------------------
export const SurveyStatusResponseSchema = z.array(
  z.object({
    id: z.number(),
    status: z.string(),
  })
);

// ---------------------------------------------------------------------------
// 13. WaitlistStatsResponseSchema
//     Source: app/api/admin/stats/route.ts — waitlist_user SELECT for stats
//     Code:   (await waitlistRes.json()) as Array<{ id, utm_tracker,
//                                                   created_date_time }>
// ---------------------------------------------------------------------------
export const WaitlistStatsResponseSchema = z.array(
  z.object({
    id: z.number(),
    utm_tracker: z.string().nullable(),
    created_date_time: z.string(),
  })
);
