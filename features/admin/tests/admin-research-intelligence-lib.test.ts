import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildResearchIntelligenceSnapshot } from "@features/admin/server/research-intelligence";
import type { QuestionEffectivenessSnapshot } from "@features/admin/server/question-effectiveness";

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe("buildResearchIntelligenceSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses embedded scoring objects when assigning theme archetypes", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce(
        okJson({
          period_comparison: null,
          high_friction_questions: null,
          top_drop_off_questions: null,
          fastest_growing_archetype: null,
        })
      )
      .mockResolvedValueOnce(
        okJson([
          {
            id: 1,
            answer_text: "Trust and honesty matter most to me.",
            survey_question: {
              id: 10,
              frontend_qid: "01002",
              question_text: "What feels hardest right now?",
            },
            survey_submission: {
              created_date_time: "2026-04-05T10:00:00.000Z",
              scoring_result: {
                primary_archetype: "Approval Seeker",
              },
            },
          },
        ])
      )
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([]));

    const snapshot = await buildResearchIntelligenceSnapshot(30, {
      questions: [],
      watchlist: [],
      dropoffDeepView: {
        contextCoverage: {
          source: true,
          embed: true,
          browser: false,
          device: false,
        },
        trust: {
          label: "derived",
          score: 80,
          note: "test",
          warning: null,
          sampleSize: 0,
          lastUpdated: "2026-04-05T10:00:00.000Z",
          source: "test",
          mode: "derived",
        },
        questions: [],
      },
      avgScore: 0,
      totalQuestions: 0,
      totalSessions: 0,
      summary: {
        regressedCount: 0,
        improvedCount: 0,
        lowConfidenceCount: 0,
        comparisonWindowDays: 30,
      },
    } as QuestionEffectivenessSnapshot);

    expect(snapshot.summary.responses).toBe(1);
    expect(snapshot.themes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          theme: "trust",
          leadingArchetype: "Approval Seeker",
        }),
      ])
    );
  });
});
