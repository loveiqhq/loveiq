import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));

import { renderWhatsNew, whatsNew } from "@features/brain/server/whats-new";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("whatsNew", () => {
  beforeEach(() => mockSupabaseFetch.mockReset());

  it("dates a notice or decision by when it first appeared and research by when it was answered", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce(
        ok([
          {
            source: "notice",
            source_id: "notice:2026-09-25-a",
            title: "Unusual numbers on Wednesday 24 September 2026",
            first_seen_at: "2026-09-25T07:05:00Z",
            // Re-written in place every hour; that is not news.
            updated_at: "2026-09-25T10:05:00Z",
          },
          {
            source: "research",
            source_id: "research:2026-09-24-b",
            title: "Research: What do competitors charge?",
            first_seen_at: "2026-09-24T15:00:00Z",
            updated_at: "2026-09-25T00:40:00Z",
          },
        ])
      )
      .mockResolvedValueOnce(
        ok([{ source_id: "research:2026-09-25-c", meta: { question: "Q?" } }])
      );
    const r = await whatsNew("2026-09-24T12:00:00Z");
    expect(r).toEqual({
      ok: true,
      waiting: 1,
      items: [
        {
          source: "notice",
          id: "notice/notice:2026-09-25-a",
          title: "Unusual numbers on Wednesday 24 September 2026",
          at: "2026-09-25T07:05",
        },
        {
          source: "research",
          id: "research/research:2026-09-24-b",
          title: "Research: What do competitors charge?",
          at: "2026-09-25T00:40",
        },
      ],
    });
    const path = String(mockSupabaseFetch.mock.calls[0]![0]);
    expect(path).toContain("first_seen_at.gte.");
    expect(path).toContain("meta->>status.in.(done,failed)");
  });

  it("reports an unreadable corpus as a failure, and an unreadable queue as unknown", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    expect(await whatsNew("2026-09-24T00:00:00Z")).toEqual({ ok: false, status: 503 });
    mockSupabaseFetch
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });
    expect(await whatsNew("2026-09-24T00:00:00Z")).toEqual({ ok: true, items: [], waiting: null });
  });
});

describe("renderWhatsNew", () => {
  const item = (n: number) => ({
    source: "decision",
    id: `decision/d${n}`,
    title: `Decision ${n}`,
    at: "2026-09-25T08:00",
  });

  it("lists one line each with its id, then what waits for tonight", () => {
    const out = renderWhatsNew([item(1)], 2, "2026-09-24");
    expect(out).toBe(
      "New since 2026-09-24, newest first:\n- 2026-09-25 08:00 decided: Decision 1 (decision/d1)\n\n" +
        "Waiting for tonight's Night Shift: 2 questions.\n\nRead any of these in full with fetch_document."
    );
  });

  it("says plainly when nothing is new, and caps a long list", () => {
    expect(renderWhatsNew([], 0, "2026-09-24")).toBe(
      "Nothing new since 2026-09-24: no notices, research answers or decisions."
    );
    const out = renderWhatsNew(
      Array.from({ length: 25 }, (_, i) => item(i)),
      null,
      "x"
    );
    expect(out.match(/^- /gm)).toHaveLength(20);
    expect(out).toContain("(5 more; narrow `since` to see them.)");
  });
});
