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
    getDelegatedToken: vi.fn(async (_subject: string, scope: string) =>
      scope === real.GMAIL_SCOPE ? null : "token"
    ),
  };
});
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) =>
    String(url).includes("sheets.googleapis.com")
      ? { ok: true, status: 200, json: async () => ({ values: [] }), text: async () => "" }
      : { ok: false, status: 503, json: async () => ({}), text: async () => "down" }
  ),
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

import { GET } from "@/app/api/cron/file-invoices/route";

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
    expect(text).toContain("Incomplete run, so invoices may be missing");
  });
});
