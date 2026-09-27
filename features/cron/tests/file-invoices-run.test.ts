/**
 * The filing as a whole run: a walk that cannot read every mailbox must not record
 * "success". Both an unreachable mailbox and running out of time used to, in silence, and
 * cost_watch trusts a successful run to have settled a month.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@shared/http/google-oauth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@shared/http/google-oauth")>();
  return {
    ...real,
    // Drive and Sheets work; every Gmail mailbox refuses.
    // Drive and Sheets work; of the Gmail mailboxes only teamwork@ answers.
    getDelegatedToken: vi.fn(async (subject: string, scope: string) =>
      scope === real.GMAIL_SCOPE && subject !== "teamwork@loveiq.org" ? null : "token"
    ),
  };
});
const fetched: string[] = [];
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    fetched.push(String(url));
    const ok = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => "",
    });
    if (String(url).includes("sheets.googleapis.com")) return ok({ values: [] });
    // One reachable mailbox, whose invoice list runs to a second page.
    if (String(url).includes("gmail.googleapis.com")) {
      return ok(
        String(url).includes("pageToken=p2")
          ? { messages: [] }
          : { messages: [], nextPageToken: "p2" }
      );
    }
    return { ok: false, status: 503, json: async () => ({}), text: async () => "down" };
  }),
}));
const mockNotify = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...a: unknown[]) => mockNotify(...a),
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
const mockRecord = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: (...a: unknown[]) => mockRecord(...a),
  startCronTimer: () => async () => undefined,
}));

import { GET, shouldWriteSheet } from "@/app/api/cron/file-invoices/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
});

describe("a filing run that could not read every mailbox", () => {
  it("records an error, not success, and says so in #ops", async () => {
    await GET(
      new Request("https://www.loveiq.org/api/cron/file-invoices", {
        headers: { authorization: "Bearer s" },
      })
    );
    expect(mockRecord).toHaveBeenCalledWith(
      "file-invoices",
      expect.any(Number),
      "error",
      expect.stringContaining("no Gmail access to")
    );
    const text = String((mockNotify.mock.calls.at(-1)?.[0] as { text: string }).text);
    expect(text).toContain("Incomplete run, so the cost sheet was NOT updated");
    // Every page of a mailbox's invoice list is read, not just the first hundred.
    expect(
      fetched.some((u) => u.includes("gmail.googleapis.com") && u.includes("pageToken=p2"))
    ).toBe(true);
  });

  it("writes reconciled figures only from a complete walk", () => {
    expect(shouldWriteSheet([{}], [])).toBe(true);
    expect(shouldWriteSheet([{}], ["no Gmail access to x@loveiq.org"])).toBe(false);
    expect(shouldWriteSheet([], [])).toBe(false);
  });
});
