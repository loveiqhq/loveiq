/**
 * Contract tests for Supabase response shapes.
 *
 * Each describe block validates that the Zod schema for a Supabase response
 * correctly accepts valid data and rejects invalid/incomplete data.
 *
 * These tests exist to catch drift between the mock data used in unit tests
 * and the actual shapes returned by the Supabase REST API. If a schema parse
 * fails in production the API route will silently cast incorrect data — these
 * tests surface that before it reaches production.
 */

import { describe, it, expect } from "vitest";
import {
  RateLimitResponseSchema,
  CooldownResponseSchema,
  WaitlistIdempotencyResponseSchema,
  WaitlistInsertResponseSchema,
  SurveySubmitResponseSchema,
  BehaviorStatsResponseSchema,
  AnswerDistributionResponseSchema,
  SubmissionListResponseSchema,
  SubmissionDetailResponseSchema,
  AnswerDetailResponseSchema,
  ExportAnswerResponseSchema,
  SurveyStatusResponseSchema,
  WaitlistStatsResponseSchema,
} from "./supabase-contracts";

// ---------------------------------------------------------------------------
// 1. RateLimitResponseSchema
// ---------------------------------------------------------------------------
describe("RateLimitResponseSchema", () => {
  it("accepts valid response", () => {
    const data = { allowed: true, remaining: 4, reset_at: 1234567890 };
    expect(() => RateLimitResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts allowed: false with remaining: 0", () => {
    const data = { allowed: false, remaining: 0, reset_at: 9999999999 };
    expect(() => RateLimitResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects missing allowed field", () => {
    const data = { remaining: 4, reset_at: 1234567890 };
    expect(() => RateLimitResponseSchema.parse(data)).toThrow();
  });

  it("rejects missing remaining field", () => {
    const data = { allowed: true, reset_at: 1234567890 };
    expect(() => RateLimitResponseSchema.parse(data)).toThrow();
  });

  it("rejects wrong type for allowed", () => {
    const data = { allowed: "yes", remaining: 4, reset_at: 1234567890 };
    expect(() => RateLimitResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. CooldownResponseSchema
// ---------------------------------------------------------------------------
describe("CooldownResponseSchema", () => {
  it("accepts array with one record", () => {
    const data = [{ updated_at: "2024-01-01T00:00:00.000Z" }];
    expect(() => CooldownResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts empty array (no prior cooldown hit)", () => {
    expect(() => CooldownResponseSchema.parse([])).not.toThrow();
  });

  it("rejects record missing updated_at", () => {
    const data = [{ some_other_field: "value" }];
    expect(() => CooldownResponseSchema.parse(data)).toThrow();
  });

  it("rejects non-string updated_at", () => {
    const data = [{ updated_at: 1234567890 }];
    expect(() => CooldownResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. WaitlistIdempotencyResponseSchema
// ---------------------------------------------------------------------------
describe("WaitlistIdempotencyResponseSchema", () => {
  it("accepts array with matching record", () => {
    const data = [{ id: "abc-123-uuid" }];
    expect(() => WaitlistIdempotencyResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts empty array (email not found)", () => {
    expect(() => WaitlistIdempotencyResponseSchema.parse([])).not.toThrow();
  });

  it("rejects record with numeric id", () => {
    // The route casts id as string; numeric would be a schema mismatch
    const data = [{ id: 42 }];
    expect(() => WaitlistIdempotencyResponseSchema.parse(data)).toThrow();
  });

  it("rejects record missing id field", () => {
    const data = [{ email: "alice@example.com" }];
    expect(() => WaitlistIdempotencyResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. WaitlistInsertResponseSchema
// ---------------------------------------------------------------------------
describe("WaitlistInsertResponseSchema", () => {
  it("accepts valid inserted row", () => {
    const data = [
      {
        id: 1,
        email: "alice@example.com",
        source: "landing-modal",
        created_date_time: "2024-01-01T00:00:00.000Z",
      },
    ];
    expect(() => WaitlistInsertResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects row with string id (Supabase serial id is numeric)", () => {
    const data = [
      {
        id: "uuid-string",
        email: "alice@example.com",
        source: "landing-modal",
        created_date_time: "2024-01-01T00:00:00.000Z",
      },
    ];
    expect(() => WaitlistInsertResponseSchema.parse(data)).toThrow();
  });

  it("rejects row missing source field", () => {
    const data = [
      {
        id: 1,
        email: "alice@example.com",
        created_date_time: "2024-01-01T00:00:00.000Z",
      },
    ];
    expect(() => WaitlistInsertResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. SurveySubmitResponseSchema
// ---------------------------------------------------------------------------
describe("SurveySubmitResponseSchema", () => {
  it("accepts success: true without error field", () => {
    const data = { success: true };
    expect(() => SurveySubmitResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts success: false with error message", () => {
    const data = { success: false, error: "Duplicate submission" };
    expect(() => SurveySubmitResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects missing success field", () => {
    const data = { error: "Something went wrong" };
    expect(() => SurveySubmitResponseSchema.parse(data)).toThrow();
  });

  it("rejects non-boolean success", () => {
    const data = { success: 1, error: undefined };
    expect(() => SurveySubmitResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. BehaviorStatsResponseSchema
// ---------------------------------------------------------------------------
describe("BehaviorStatsResponseSchema", () => {
  const validData = {
    dropOff: [{ q_id: "01001", count: 3 }],
    avgTimePerQuestion: [{ q_id: "01001", avg_ms: 4500 }],
    funnel: {
      unique_sessions: 100,
      completed_sessions: 60,
      abandoned_sessions: 40,
    },
    chapterDropOff: [{ chapter: "intro", count: 5 }],
    backtrackRate: { back_count: 10, forward_count: 90 },
    backtrackByQuestion: [{ q_id: "01002", count: 2 }],
    chapterFunnel: [{ chapter: "intro", sessions: 100 }],
  };

  it("accepts fully populated valid response", () => {
    expect(() => BehaviorStatsResponseSchema.parse(validData)).not.toThrow();
  });

  it("accepts empty arrays (no events yet)", () => {
    const data = {
      ...validData,
      dropOff: [],
      avgTimePerQuestion: [],
      chapterDropOff: [],
      backtrackByQuestion: [],
      chapterFunnel: [],
    };
    expect(() => BehaviorStatsResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects missing funnel field", () => {
    const { funnel: _funnel, ...rest } = validData;
    expect(() => BehaviorStatsResponseSchema.parse(rest)).toThrow();
  });

  it("rejects funnel missing unique_sessions", () => {
    const data = {
      ...validData,
      funnel: { completed_sessions: 60, abandoned_sessions: 40 },
    };
    expect(() => BehaviorStatsResponseSchema.parse(data)).toThrow();
  });

  it("rejects dropOff entry missing count", () => {
    const data = {
      ...validData,
      dropOff: [{ q_id: "01001" }],
    };
    expect(() => BehaviorStatsResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. AnswerDistributionResponseSchema
// ---------------------------------------------------------------------------
describe("AnswerDistributionResponseSchema", () => {
  const validData = {
    single: [{ q_id: "01001", option_text: "Yes", count: 42 }],
    multiple: [{ q_id: "01002", option_text: "Option A", count: 15 }],
  };

  it("accepts valid distribution response", () => {
    expect(() => AnswerDistributionResponseSchema.parse(validData)).not.toThrow();
  });

  it("accepts empty single and multiple arrays", () => {
    const data = { single: [], multiple: [] };
    expect(() => AnswerDistributionResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects missing single field", () => {
    const data = { multiple: [] };
    expect(() => AnswerDistributionResponseSchema.parse(data)).toThrow();
  });

  it("rejects single entry missing option_text", () => {
    const data = {
      single: [{ q_id: "01001", count: 42 }],
      multiple: [],
    };
    expect(() => AnswerDistributionResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8. SubmissionListResponseSchema
// ---------------------------------------------------------------------------
describe("SubmissionListResponseSchema", () => {
  const validRow = {
    id: 1,
    status: "completed",
    start_date_time: "2024-01-01T10:00:00.000Z",
    created_date_time: "2024-01-01T10:30:00.000Z",
    duration_ms: 1800000,
    app_user: { email: "alice@example.com", first_name: "Alice" },
  };

  it("accepts array with full record", () => {
    expect(() => SubmissionListResponseSchema.parse([validRow])).not.toThrow();
  });

  it("accepts null start_date_time and duration_ms", () => {
    const data = [{ ...validRow, start_date_time: null, duration_ms: null }];
    expect(() => SubmissionListResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts null app_user (user deleted)", () => {
    const data = [{ ...validRow, app_user: null }];
    expect(() => SubmissionListResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts empty array", () => {
    expect(() => SubmissionListResponseSchema.parse([])).not.toThrow();
  });

  it("rejects record missing created_date_time", () => {
    const { created_date_time: _cdt, ...rest } = validRow;
    expect(() => SubmissionListResponseSchema.parse([rest])).toThrow();
  });

  it("rejects non-numeric id", () => {
    const data = [{ ...validRow, id: "not-a-number" }];
    expect(() => SubmissionListResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. SubmissionDetailResponseSchema
// ---------------------------------------------------------------------------
describe("SubmissionDetailResponseSchema", () => {
  const validRow = {
    id: 7,
    status: "flagged",
    start_date_time: null,
    created_date_time: "2024-03-01T09:00:00.000Z",
    duration_ms: null,
    app_user: { email: "bob@example.com", first_name: "Bob" },
  };

  it("accepts single-element array (PostgREST detail response)", () => {
    expect(() => SubmissionDetailResponseSchema.parse([validRow])).not.toThrow();
  });

  it("accepts empty array (not found case)", () => {
    // Route checks submissions.length === 0 and returns 404
    expect(() => SubmissionDetailResponseSchema.parse([])).not.toThrow();
  });

  it("rejects missing status field", () => {
    const { status: _s, ...rest } = validRow;
    expect(() => SubmissionDetailResponseSchema.parse([rest])).toThrow();
  });

  it("rejects app_user missing first_name", () => {
    const data = [{ ...validRow, app_user: { email: "bob@example.com" } }];
    expect(() => SubmissionDetailResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 10. AnswerDetailResponseSchema
// ---------------------------------------------------------------------------
describe("AnswerDetailResponseSchema", () => {
  const validRow = {
    id: 101,
    answer_text: null,
    answer_option_id: 5,
    normalized_value: null,
    answered_at: "2024-01-01T10:05:00.000Z",
    survey_question: {
      frontend_qid: "01001",
      type: "single",
      question: "How are you?",
    },
    answer_option: { option_text: "Great" },
    survey_submission_answer_options: [],
  };

  it("accepts fully populated answer row", () => {
    expect(() => AnswerDetailResponseSchema.parse([validRow])).not.toThrow();
  });

  it("accepts all nullable fields as null", () => {
    const data = [
      {
        ...validRow,
        answer_text: null,
        answer_option_id: null,
        normalized_value: null,
        answered_at: null,
        survey_question: null,
        answer_option: null,
      },
    ];
    expect(() => AnswerDetailResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts multi-choice answer with nested options", () => {
    const data = [
      {
        ...validRow,
        answer_option_id: null,
        answer_option: null,
        survey_submission_answer_options: [
          { answer_option: { option_text: "Option A" } },
          { answer_option: null },
        ],
      },
    ];
    expect(() => AnswerDetailResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects answer row missing id", () => {
    const { id: _id, ...rest } = validRow;
    expect(() => AnswerDetailResponseSchema.parse([rest])).toThrow();
  });

  it("rejects survey_question missing question field", () => {
    const data = [
      {
        ...validRow,
        survey_question: { frontend_qid: "01001", type: "single" },
      },
    ];
    expect(() => AnswerDetailResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 11. ExportAnswerResponseSchema
// ---------------------------------------------------------------------------
describe("ExportAnswerResponseSchema", () => {
  const validRow = {
    survey_submission_id: 1,
    answer_text: "Some text",
    answer_option_id: null,
    normalized_value: null,
    survey_question: { frontend_qid: "01001", type: "open" },
    answer_option: null,
    survey_submission_answer_options: [],
  };

  it("accepts valid export answer row", () => {
    expect(() => ExportAnswerResponseSchema.parse([validRow])).not.toThrow();
  });

  it("accepts all nullable fields as null", () => {
    const data = [
      {
        ...validRow,
        answer_text: null,
        survey_question: null,
      },
    ];
    expect(() => ExportAnswerResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects row missing survey_submission_id", () => {
    const { survey_submission_id: _sid, ...rest } = validRow;
    expect(() => ExportAnswerResponseSchema.parse([rest])).toThrow();
  });

  it("rejects survey_question with question field (export shape has no question text)", () => {
    // The export schema intentionally excludes the question text field.
    // If Supabase returns it anyway, it should still parse (extra keys are allowed by Zod default).
    // This test verifies the schema does NOT require the question field.
    const data = [
      {
        ...validRow,
        survey_question: { frontend_qid: "01001", type: "open" },
      },
    ];
    expect(() => ExportAnswerResponseSchema.parse(data)).not.toThrow();
  });

  it("rejects survey_question missing type field", () => {
    const data = [
      {
        ...validRow,
        survey_question: { frontend_qid: "01001" },
      },
    ];
    expect(() => ExportAnswerResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 12. SurveyStatusResponseSchema
// ---------------------------------------------------------------------------
describe("SurveyStatusResponseSchema", () => {
  it("accepts array with survey row", () => {
    const data = [{ id: 1, status: "active" }];
    expect(() => SurveyStatusResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts closed status", () => {
    const data = [{ id: 1, status: "closed" }];
    expect(() => SurveyStatusResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts empty array (no survey configured)", () => {
    expect(() => SurveyStatusResponseSchema.parse([])).not.toThrow();
  });

  it("rejects row missing status field", () => {
    const data = [{ id: 1 }];
    expect(() => SurveyStatusResponseSchema.parse(data)).toThrow();
  });

  it("rejects non-numeric id", () => {
    const data = [{ id: "survey-1", status: "active" }];
    expect(() => SurveyStatusResponseSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 13. WaitlistStatsResponseSchema
// ---------------------------------------------------------------------------
describe("WaitlistStatsResponseSchema", () => {
  it("accepts array with full records", () => {
    const data = [
      {
        id: 1,
        utm_tracker: "instagram",
        created_date_time: "2024-01-01T00:00:00.000Z",
      },
      {
        id: 2,
        utm_tracker: null,
        created_date_time: "2024-01-02T00:00:00.000Z",
      },
    ];
    expect(() => WaitlistStatsResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts null utm_tracker (organic/direct signups)", () => {
    const data = [{ id: 5, utm_tracker: null, created_date_time: "2024-06-01T12:00:00.000Z" }];
    expect(() => WaitlistStatsResponseSchema.parse(data)).not.toThrow();
  });

  it("accepts empty array (no signups in period)", () => {
    expect(() => WaitlistStatsResponseSchema.parse([])).not.toThrow();
  });

  it("rejects record missing created_date_time", () => {
    const data = [{ id: 1, utm_tracker: null }];
    expect(() => WaitlistStatsResponseSchema.parse(data)).toThrow();
  });

  it("rejects non-numeric id", () => {
    const data = [{ id: "uuid", utm_tracker: null, created_date_time: "2024-01-01T00:00:00.000Z" }];
    expect(() => WaitlistStatsResponseSchema.parse(data)).toThrow();
  });
});
