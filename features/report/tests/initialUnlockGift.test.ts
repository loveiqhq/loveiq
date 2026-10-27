import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { grantGiftedInitialUnlock } from "@features/report/server/initialUnlockGift";
import { initialUnlockGiftEmail } from "@features/report/server/emails/initial-unlock-gift";

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

/** E07's gift: the initial unlock as a EUR 0 payment, once per report. */
describe("grantGiftedInitialUnlock", () => {
  function routeGrant({ existing }: { existing: unknown[] }) {
    const posted: Record<string, unknown>[] = [];
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          posted.push(JSON.parse(options.body ?? "{}") as Record<string, unknown>);
          return json([{ id: 301 }], 201);
        }
        if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) return json(existing);
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );
    return posted;
  }

  it("writes one EUR 0 initial payment, marked as E07's gift", async () => {
    const posted = routeGrant({ existing: [] });
    const id = await grantGiftedInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
    });
    expect(id).toBe(301);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual(
      expect.objectContaining({
        amount: 0,
        currency: "EUR",
        status: "succeeded",
        description: "LoveIQ Your Core Archetype (gift)",
        personal_report_id: 9,
        user_id: 7,
        is_test: false,
        metadata: { plan: "initial", gifted: "e07", unlockSource: "e07_gift" },
      })
    );
  });

  it("adds nothing when the report already has its gift", async () => {
    const posted = routeGrant({ existing: [{ id: 288 }] });
    const id = await grantGiftedInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
    });
    expect(id).toBe(288);
    expect(posted).toHaveLength(0);
    const lookup = String(mockFetchWithTimeout.mock.calls[0]![0]);
    expect(lookup).toContain("metadata->>gifted=eq.e07");
  });

  it("marks a staff reader's gift as a test", async () => {
    const posted = routeGrant({ existing: [] });
    await grantGiftedInitialUnlock({ personalReportId: 9, userId: 7, email: "fh@loveiq.org" });
    expect(posted[0]).toEqual(expect.objectContaining({ is_test: true }));
  });

  it("answers null, and writes nothing, when the payments can't be read", async () => {
    mockFetchWithTimeout.mockResolvedValue(json({ message: "boom" }, 500));
    const id = await grantGiftedInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
    });
    expect(id).toBeNull();
    expect(
      mockFetchWithTimeout.mock.calls.some(
        (call) => (call[1] as { method?: string } | undefined)?.method === "POST"
      )
    ).toBe(false);
  });
});

/** E07, "Your Core Archetype is on us" (Figma Report-3.0 1669:2835), verbatim. */
describe("initialUnlockGiftEmail", () => {
  const REPORT_URL = "https://www.loveiq.org/report/rpt_ABCDEFGHIJKLMNOPQRST?from=email";
  const email = initialUnlockGiftEmail({
    firstName: "Alex",
    reportUrl: REPORT_URL,
    siteUrl: "https://www.loveiq.org",
    unsubscribeUrl: "https://www.loveiq.org/api/unsubscribe?token=t&src=initial_gift",
  });

  it("says what the frame says, in both parts", () => {
    expect(email.subject).toBe("We unlocked your Core Archetype for you");
    for (const part of [email.html, email.text]) {
      expect(part).toMatch(/Your Core Archetype is on us\./);
      expect(part).toContain("Hi Alex,");
      expect(part).toMatch(
        /A few days ago you answered some very personal questions\. Your result has been waiting ever since, and we(’|&rsquo;|')d rather you read it than leave it there\./
      );
      expect(part).toMatch(/So we(’|&rsquo;|')ve unlocked it for you\./);
      expect(part).toContain("No payment, no catch.");
      expect(part).toContain("three chapters in full");
      // Sync 26.10: a locked V4 chapter draws no body, so no "preview" is promised.
      expect(part).toMatch(
        /Every other chapter shows what it covers, so you can see what(’|&rsquo;|')s waiting for you\./
      );
      expect(part).not.toContain("opens with a preview");
      expect(part).toContain("Typical Beliefs:");
      expect(part).toContain("Fantasy vs. Reality:");
      expect(part).toMatch(/P\.S\. If it lands and you want the rest, you have/);
      expect(part).toMatch(/(€|&euro;)10 off the full report/);
      expect(part).toContain("hello@loveiq.org");
    }
  });

  it("carries the preview line and leads its button to the report", () => {
    expect(email.html).toContain("No payment needed. Your result is waiting.");
    expect(email.html).toContain("Open your Core Archetype");
    expect(email.html).toContain(`href="${REPORT_URL.replace(/&/g, "&amp;")}"`);
    expect(email.text).toContain(`Open your Core Archetype: ${REPORT_URL}`);
  });

  it("greets a reader with no first name", () => {
    const nameless = initialUnlockGiftEmail({
      reportUrl: REPORT_URL,
      siteUrl: "https://www.loveiq.org",
    });
    expect(nameless.text).toContain("Hi there,");
  });
});
