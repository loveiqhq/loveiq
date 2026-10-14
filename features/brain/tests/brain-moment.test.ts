import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));

import { eventToRows } from "@features/brain/server/ingest/calendar";
import { docToRows } from "@features/brain/server/ingest/drive";
import { threadToRows } from "@features/brain/server/ingest/gmail";
import { pageToRow, taskToRow } from "@features/brain/server/ingest/notion";
import { momentOf } from "@features/brain/server/ingest/upsert";

/**
 * `meta.at` orders one day's records in `browse_context`, which shows it in Berlin time.
 * Each timed source must stamp it, and stamp the same instant `period_end` is the day of,
 * or a record sorts and reads under a day it does not belong to.
 */
const STAMP = "2026-10-14T09:00:00.000Z";
const LATE = "2026-10-13T22:30:00.000Z"; // 00:30 on the 14th in Berlin, the 13th in UTC

describe("momentOf", () => {
  it("writes one format, whose text order is time order", () => {
    expect(momentOf("2026-10-14T09:00:00+02:00")).toBe("2026-10-14T07:00:00.000Z");
    expect(momentOf(Date.parse(LATE))).toBe(LATE);
    expect(momentOf("2026-10-13T22:30:00Z")).toBe(LATE);
  });

  it("gives nothing for no time, rather than an invented one", () => {
    for (const v of [null, undefined, "", 0, "not a date"]) expect(momentOf(v)).toBeUndefined();
  });
});

describe("every timed source stamps the moment its day is the day of", () => {
  it("drive: when the document was last written", () => {
    const [row] = docToRows(
      {
        id: "d1",
        name: "LoveIQ Sync - 2026/10/13 23:00 CEST - Notes by Gemini",
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: LATE,
        createdTime: "2026-10-13T22:05:00.000Z",
      },
      "Summary\nAgreed.",
      STAMP
    );
    expect(row!.meta.at).toBe(LATE);
    expect(row!.period_end).toBe("2026-10-13");
  });

  it("gmail: when the last message arrived", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    const message = (when: string, text: string) => ({
      internalDate: String(Date.parse(when)),
      payload: {
        headers: [
          { name: "From", value: "Mark <mo@loveiq.org>" },
          { name: "Subject", value: "Pricing test" },
        ],
        mimeType: "text/plain",
        body: { data: b64(text) },
      },
    });
    const [row] = threadToRows(
      {
        id: "t1",
        historyId: "9",
        messages: [
          message("2026-10-13T08:00:00Z", "Shall we ship the pricing test on Monday?"),
          message(LATE, "Yes, agreed, Monday it is for the pricing test."),
        ],
      },
      "mo@loveiq.org",
      STAMP
    );
    expect(row!.meta.at).toBe(LATE);
    expect(row!.period_end).toBe("2026-10-13");
  });

  it("calendar: when the meeting starts, and no time for an all-day event", () => {
    const event = (start: Record<string, string>) => ({
      id: "e1",
      iCalUID: "u1",
      summary: "LoveIQ Sync",
      status: "confirmed",
      start,
      attendees: [{ email: "ec@loveiq.org" }, { email: "mo@loveiq.org" }],
    });
    const [timed] = eventToRows(event({ dateTime: "2026-10-14T09:00:00+02:00" }), STAMP, null);
    expect(timed!.meta.at).toBe("2026-10-14T07:00:00.000Z");
    expect(timed!.period_end).toBe("2026-10-14");
    const [allDay] = eventToRows(event({ date: "2026-10-14" }), STAMP, null);
    expect(allDay!.meta.at).toBeUndefined();
  });

  it("notion: when the task or page last changed", () => {
    const page = {
      id: "3cae0cbe-f1a3-380e-b483-d94fc5a2e2fb",
      url: "https://app.notion.com/x",
      created_time: "2026-10-01T07:32:00.000Z",
      last_edited_time: LATE,
      properties: { Name: { type: "title", title: [{ plain_text: "Ship the pricing test" }] } },
    };
    const task = taskToRow(page, STAMP)!;
    expect(task.meta.at).toBe(LATE);
    expect(task.period_end).toBe("2026-10-13");
    expect(pageToRow(page, "body", STAMP)!.meta.at).toBe(LATE);
  });
});
