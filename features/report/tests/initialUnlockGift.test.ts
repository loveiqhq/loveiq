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

import {
  grantChosenFreeInitialUnlock,
  grantGiftedInitialUnlock,
} from "@features/report/server/initialUnlockGift";
import { initialUnlockGiftEmail } from "@features/report/server/emails/initial-unlock-gift";
import {
  initialUnlockPaidCentsOf,
  initialUnlockSourceOf,
} from "@features/report/server/personalReport";

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

/**
 * E07, "Your Core Archetype is on us" (Figma Report-3.0 1669:2835), verbatim but for its first
 * three words: it goes out on day 1 (Marcus, 27.10), so "Yesterday" when the survey was that
 * recent and no day otherwise, never the frame's "A few days ago".
 */
/**
 * How a reader holds the initial unlock, which the full report's exit page words the EUR 10 by
 * (28.10): "You earned it with your €1.99 unlock" is not true of E07's gift.
 */
describe("initialUnlockSourceOf", () => {
  const gift = { metadata: { plan: "initial", gifted: "e07", unlockSource: "e07_gift" } };
  const bought = { metadata: { plan: "initial", checkoutSessionId: "cs_1" } };
  const full = { metadata: { plan: "full_report" } };

  it("is the gift when E07's EUR 0 row is all there is", () => {
    expect(initialUnlockSourceOf([gift, full])).toBe("gift");
  });

  it("is paid when the reader bought it, gift or no gift", () => {
    expect(initialUnlockSourceOf([bought])).toBe("paid");
    expect(initialUnlockSourceOf([gift, bought])).toBe("paid");
  });

  it("is nothing without an initial unlock", () => {
    expect(initialUnlockSourceOf([])).toBeNull();
    expect(initialUnlockSourceOf([full, { metadata: null }])).toBeNull();
  });

  // The price test's EUR 0 is no more paid than the gift: "You earned it with your €1.99
  // unlock" would not be true of it.
  it("is the gift for EUR 0 chosen on Choose your price", () => {
    const free = { metadata: { plan: "initial", priceOption: "free", currentPrice: "0.00" } };
    expect(initialUnlockSourceOf([free])).toBe("gift");
    expect(initialUnlockSourceOf([free, bought])).toBe("paid");
  });
});

describe("initialUnlockPaidCentsOf", () => {
  const row = (metadata: Record<string, unknown>) => ({
    metadata: { plan: "initial", ...metadata },
  });

  it("is the price the reader paid: EUR 1.99 on today's page, the price chosen on the other", () => {
    expect(initialUnlockPaidCentsOf([row({ currentPrice: "1.99" })])).toBe(199);
    expect(initialUnlockPaidCentsOf([row({ currentPrice: "6.99", priceOption: "fair" })])).toBe(
      699
    );
    expect(initialUnlockPaidCentsOf([row({ currentPrice: "4.50", priceOption: "custom" })])).toBe(
      450
    );
  });

  it("reads the newest paid row first (payments come newest first)", () => {
    expect(
      initialUnlockPaidCentsOf([
        row({ currentPrice: "19.99", priceOption: "support" }),
        row({ currentPrice: "1.99" }),
      ])
    ).toBe(1999);
  });

  it("is nothing for the gift, EUR 0, a row naming no price, or another plan", () => {
    expect(initialUnlockPaidCentsOf([row({ gifted: "e07", currentPrice: "0.00" })])).toBeNull();
    expect(
      initialUnlockPaidCentsOf([row({ priceOption: "free", currentPrice: "0.00" })])
    ).toBeNull();
    expect(initialUnlockPaidCentsOf([row({ journey: "pay_to_start" })])).toBeNull();
    expect(
      initialUnlockPaidCentsOf([{ metadata: { plan: "full_report", currentPrice: "29.99" } }])
    ).toBeNull();
  });
});

/** EUR 0 chosen on the price test's Choose your price page: no Stripe, a EUR 0 initial row. */
describe("grantChosenFreeInitialUnlock", () => {
  function routeFree({ existing }: { existing: unknown[] }) {
    const posted: Record<string, unknown>[] = [];
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          posted.push(JSON.parse(options.body ?? "{}") as Record<string, unknown>);
          return json([{ id: 401 }], 201);
        }
        if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) return json(existing);
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );
    return posted;
  }

  it("writes one EUR 0 initial payment, marked as the free pick of the choosing half", async () => {
    const posted = routeFree({ existing: [] });
    const id = await grantChosenFreeInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
      landingVariant: "video",
    });
    expect(id).toBe(401);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual(
      expect.objectContaining({
        amount: 0,
        currency: "EUR",
        status: "succeeded",
        description: "LoveIQ Your Core Archetype (chosen price, EUR 0)",
        personal_report_id: 9,
        user_id: 7,
        is_test: false,
        metadata: {
          plan: "initial",
          priceOption: "free",
          currentPrice: "0.00",
          gateRevealArm: "choose",
          landingVariant: "video",
          unlockSource: "report_gate",
        },
      })
    );
  });

  it("adds nothing when the report holds its initial unlock already", async () => {
    const posted = routeFree({ existing: [{ id: 377 }] });
    const id = await grantChosenFreeInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
      landingVariant: "white",
    });
    expect(id).toBe(377);
    expect(posted).toHaveLength(0);
    const lookup = String(mockFetchWithTimeout.mock.calls[0]![0]);
    expect(lookup).toContain("metadata->>plan=eq.initial");
    expect(lookup).toContain("status=eq.succeeded");
  });

  // Review of #799: two requests at the same moment both found no row and both wrote a EUR 0
  // claim. payment_chosen_free_once (20261127210000) refuses the second (PostgREST answers 409),
  // and that request answers with the first one's row, as unlock feedback's grant does.
  it("keeps one claim when two arrive at once: the second is refused and answers with the first", async () => {
    let lookups = 0;
    let posts = 0;
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options?: { body?: string; method?: string }) => {
        if (options?.method === "POST" && url.endsWith("/rest/v1/payment")) {
          posts += 1;
          return json({ code: "23505", message: "duplicate key value" }, 409);
        }
        if (url.includes("/rest/v1/payment?personal_report_id=eq.9")) {
          lookups += 1;
          return json(lookups === 1 ? [] : [{ id: 401 }]);
        }
        throw new Error(`Unexpected fetch call: ${options?.method ?? "GET"} ${url}`);
      }
    );
    const id = await grantChosenFreeInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "reader@example.com",
      landingVariant: null,
    });
    expect(id).toBe(401);
    expect(posts).toBe(1);
    expect(lookups).toBe(2);
  });

  it("marks a staff reader's as a test, and gives nothing back when the write fails", async () => {
    const posted = routeFree({ existing: [] });
    await grantChosenFreeInitialUnlock({
      personalReportId: 9,
      userId: 7,
      email: "fh@loveiq.org",
      landingVariant: null,
    });
    expect(posted[0]).toEqual(expect.objectContaining({ is_test: true }));

    mockFetchWithTimeout.mockImplementation(async (_url: string, options?: { method?: string }) =>
      options?.method === "POST" ? json({}, 500) : json([])
    );
    expect(
      await grantChosenFreeInitialUnlock({
        personalReportId: 9,
        userId: 7,
        email: "reader@example.com",
        landingVariant: null,
      })
    ).toBeNull();
  });
});

describe("initialUnlockGiftEmail", () => {
  const REPORT_URL = "https://www.loveiq.org/report/rpt_ABCDEFGHIJKLMNOPQRST?from=email";
  const email = initialUnlockGiftEmail({
    firstName: "Alex",
    reportUrl: REPORT_URL,
    siteUrl: "https://www.loveiq.org",
    unsubscribeUrl: "https://www.loveiq.org/api/unsubscribe?token=t&src=initial_gift",
  });

  it("says what the frame says, in both parts, naming no day by default", () => {
    expect(email.subject).toBe("We unlocked your Core Archetype for you");
    for (const part of [email.html, email.text]) {
      expect(part).toMatch(/Your Core Archetype is on us\./);
      expect(part).toContain("Hi Alex,");
      expect(part).toMatch(
        /You answered some very personal questions\. Your result has been waiting ever since, and we(’|&rsquo;|')d rather you read it than leave it there\./
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

  // Day 1 (Marcus, 27.10): "Yesterday" when the survey was, and no day named otherwise.
  it("says Yesterday only when told the survey was a day ago", () => {
    const recent = initialUnlockGiftEmail({
      answeredYesterday: true,
      firstName: "Alex",
      reportUrl: REPORT_URL,
      siteUrl: "https://www.loveiq.org",
    });
    for (const part of [recent.html, recent.text]) {
      expect(part).toMatch(
        /Yesterday you answered some very personal questions\. Your result has been waiting ever since, and we(’|&rsquo;|')d rather you read it than leave it there\./
      );
    }
    for (const part of [email.html, email.text]) expect(part).not.toMatch(/yesterday/i);
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
