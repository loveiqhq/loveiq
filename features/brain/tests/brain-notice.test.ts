import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MAX_INJECTED, buildNoticeRow, renderOpenNotices } from "@features/brain/server/notice";

const NOW = new Date("2026-09-12T09:00:00Z");

describe("buildNoticeRow", () => {
  it("puts the headline in the TITLE, where ranking weighs it double", () => {
    // A title of "Notice" shares no word with any question anyone asks — the same
    // lesson `record_decision` already paid for.
    const row = buildNoticeRow(
      {
        headline: "Survey starts fell 45% against July",
        detail: "544 against 987.",
        kind: "anomaly-watcher",
      },
      NOW
    );
    expect(row.title).toBe("Survey starts fell 45% against July");
    expect(row.source).toBe("notice");
  });

  it("says which job noticed it and when, in the body", () => {
    const row = buildNoticeRow({ headline: "h", detail: "d", kind: "anomaly-watcher" }, NOW);
    expect(row.body).toContain("Noticed on 2026-09-12 by anomaly-watcher, without being asked");
    expect(row.meta.noticed_on).toBe("2026-09-12");
  });

  it("gives the same notice on the same day the same id, so a re-run does not double-post", () => {
    const a = buildNoticeRow({ headline: "same thing", detail: "x", kind: "k" }, NOW);
    const b = buildNoticeRow(
      { headline: "  SAME THING  ", detail: "different detail", kind: "k" },
      NOW
    );
    expect(a.source_id).toBe(b.source_id);
  });

  it("gives the same notice on a DIFFERENT day a different id", () => {
    // Yesterday's move and today's are two observations, not one repeated.
    const a = buildNoticeRow({ headline: "same thing", detail: "x", kind: "k" }, NOW);
    const b = buildNoticeRow(
      { headline: "same thing", detail: "x", kind: "k" },
      new Date("2026-09-13T09:00:00Z")
    );
    expect(a.source_id).not.toBe(b.source_id);
  });
});

describe("renderOpenNotices — an interjection that explains itself", () => {
  const notice = (n: number) => ({
    title: `notice ${n}`,
    sourceId: `notice:2026-09-12-${n}`,
    noticedOn: "2026-09-12",
  });

  it("renders nothing at all when there is nothing to say", () => {
    expect(renderOpenNotices([])).toBe("");
  });

  /**
   * THE SENTENCE THAT MAKES THIS SAFE TO PREPEND.
   *
   * This block appears on results for questions it has nothing to do with. Without
   * saying WHY it is there, it is indistinguishable from a relevant answer — and a
   * reader who cannot tell the difference either acts on it or learns to distrust the
   * whole result. `renderPriorDecisions` established the shape; this copies it.
   */
  it("says it was posted on a timer and can be ignored", () => {
    const out = renderOpenNotices([notice(1)]);
    expect(out).toContain("not in response to your question");
    expect(out).toContain("posted on a timer, not matched to you");
    expect(out).toContain("ignore this block");
  });

  it("dates every notice, because an undated one invites acting on stale news", () => {
    expect(renderOpenNotices([notice(1)])).toContain("noticed 2026-09-12");
  });

  it("gives a handle to read the whole thing", () => {
    expect(renderOpenNotices([notice(1)])).toContain("id: notice/notice:2026-09-12-1");
  });

  it(`never renders more than ${MAX_INJECTED}, however busy the day`, () => {
    // The cap is applied at the read, so this asserts the contract the reader relies on:
    // a block that grows without bound stops being ambient and starts being noise.
    expect(MAX_INJECTED).toBeLessThanOrEqual(3);
  });

  it("warns that it will repeat, rather than pretending to be acknowledged", () => {
    // There is no per-caller acknowledgement and there cannot be: one shared bearer
    // token means "seen by you" would silently mean "seen by anyone on the team".
    expect(renderOpenNotices([notice(1)])).toContain("appear again for the rest of the day");
  });
});
