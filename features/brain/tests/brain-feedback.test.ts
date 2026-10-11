import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));

import { loadFeedback, renderFeedback } from "@features/brain/server/feedback";

const vote = (over: Record<string, unknown> = {}) => ({
  section_id: "core_archetype",
  feedback: "up",
  issue: null,
  comment: null,
  created_at: "2026-10-04T10:00:00Z",
  app_user: { email: "reader@example.com" },
  ...over,
});
const answer = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});

describe("loadFeedback", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
  });

  it("reads the votes in the window and the Trustpilot reviews, leaving the team's test votes out", async () => {
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/report_section_feedback")
        ? answer([vote(), vote({ app_user: { email: "ec@loveiq.org" } }), vote({ app_user: null })])
        : answer([
            {
              source_id: "thread:b",
              title: 'Trustpilot review of LoveIQ, 4 stars, 2026-06-12: "B"',
            },
            {
              source_id: "thread:a",
              title: 'Trustpilot review of LoveIQ, 5 stars, 2026-06-16: "A"',
            },
            // A long review is several parts with one title.
            {
              source_id: "thread:b#2",
              title: 'Trustpilot review of LoveIQ, 4 stars, 2026-06-12: "B"',
            },
            // Another review that happens to read the same: still a second review.
            {
              source_id: "thread:c",
              title: 'Trustpilot review of LoveIQ, 4 stars, 2026-06-12: "B"',
            },
          ])
    );
    const f = await loadFeedback("2026-10-01", "2026-10-31");
    const [votes, reviews] = mockSupabaseFetch.mock.calls.map(([p]) => String(p));
    expect(votes).toContain(
      "&created_at=gte.2026-10-01T00:00:00Z&created_at=lt.2026-11-01T00:00:00Z"
    );
    expect(votes).toContain("app_user(email)");
    expect(reviews).toContain("source=eq.gmail&title=like.Trustpilot%20review*");
    // Every part, a page at a time, not the first 200.
    expect(reviews).toContain("&limit=1000&offset=0");
    expect(f!.votes).toHaveLength(2);
    // Newest first by the date in the title, each review once.
    expect(f!.reviews).toEqual([
      'Trustpilot review of LoveIQ, 5 stars, 2026-06-16: "A"',
      'Trustpilot review of LoveIQ, 4 stars, 2026-06-12: "B"',
      'Trustpilot review of LoveIQ, 4 stars, 2026-06-12: "B"',
    ]);
  });

  it("is null when either read fails, so an outage never reads as silence", async () => {
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/brain_chunk") ? answer(null, false) : answer([vote()])
    );
    await expect(loadFeedback()).resolves.toBeNull();
    mockSupabaseFetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/brain_chunk") ? answer([]) : answer(null, false)
    );
    await expect(loadFeedback()).resolves.toBeNull();
  });
});

describe("renderFeedback", () => {
  it("totals the votes, splits them by chapter with what was wrong, and quotes every comment", () => {
    const text = renderFeedback(
      {
        votes: [
          vote({ comment: "  Spot on,\n really me " }),
          vote({ feedback: "down", issue: "inaccurate", section_id: "core_motivation" }),
          vote({ section_id: "core_motivation", created_at: "2026-09-01T00:00:00Z" }),
          vote({ section_id: "core_motivation", feedback: "down", issue: "inaccurate" }),
        ],
        reviews: [],
      },
      "all time"
    );
    expect(text).toContain(
      "REPORT CHAPTER FEEDBACK, all time: 4 votes, 2 up and 2 down (50% up), 1 with a comment."
    );
    expect(text).toMatch(
      /By chapter, most votes first:\n- core_motivation: 1 up, 2 down \(said: inaccurate 2\)\n- core_archetype: 1 up, 0 down/
    );
    expect(text).toContain('- 2026-10-04, core_archetype, up: "Spot on, really me"');
    expect(text).toContain("TRUSTPILOT REVIEWS that reached our mail, all time: 0.");
  });

  it("cuts a very long comment instead of dropping it", () => {
    const text = renderFeedback(
      { votes: [vote({ comment: "x".repeat(700) })], reviews: [] },
      "all time"
    );
    expect(text).toContain(`: "${"x".repeat(600)}…"`);
  });

  it("always names what it cannot see, so an empty answer is never read as nobody complaining", () => {
    const text = renderFeedback({ votes: [], reviews: [] }, "2026-10-01 to today");
    expect(text).toContain("0 votes, 0 up and 0 down, 0 with a comment");
    expect(text).toContain("what customers write to hello@, the contact form included");
    expect(text).toContain("not connected until TRUSTPILOT_API_KEY is set");
    expect(text).toContain("Notion's 'Feedback Sessions'");
  });
});
