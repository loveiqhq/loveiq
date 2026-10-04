// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The admin progress views measure against the survey's own question count.
 *
 * Both used to hard-code it (61 and 62) while the survey asked 57 on main and 62 on
 * staging, so every progress bar was off and drifted further with each question added
 * or retired. 40 matches no copy anyone would hard-code, so a passing test proves the
 * components read the shared count.
 */
vi.mock("@features/survey/server/utils", () => ({ SURVEY_TOTAL_QUESTIONS: 40 }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: {
      partialSaves: [],
      killQuestions: [],
      totalPartialSaves: 0,
      totalCompleted: 0,
      abandonmentRate: 0,
      avgProgressBeforeAbandon: 20,
      hourlyPattern: [],
    },
    loading: false,
    error: null,
  }),
}));

import AbandonmentDashboard from "@features/admin/ui/AbandonmentDashboard";
import RiskSessionCard from "@features/admin/ui/pulse-tabs/RiskSessionCard";

afterEach(cleanup);

describe("admin progress against the survey's question count", () => {
  it("the risk card fills its bar by the shared count", () => {
    const { container } = render(
      <RiskSessionCard
        session={{
          session_id: "s",
          current_index: 20,
          started_at: "2026-10-04T10:00:00Z",
          saved_at: "2026-10-04T10:05:00Z",
          answers_count: 20,
          minutes_since_save: 5,
          total_minutes: 5,
          backtrack_count: 0,
          total_events: 20,
          risk_level: "normal",
        }}
      />
    );
    const bar = container.querySelector<HTMLElement>('[style*="width"]');
    expect(bar?.style.width).toBe("50%");
  });

  it("the abandonment overview divides by the shared count", () => {
    render(<AbandonmentDashboard />);
    expect(screen.getByText("/40")).toBeInTheDocument();
  });
});
