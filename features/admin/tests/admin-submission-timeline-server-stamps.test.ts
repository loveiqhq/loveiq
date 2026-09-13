import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockHasRole = vi.fn();
vi.mock("@features/admin/server/roles", () => ({
  hasRole: (...args: unknown[]) => mockHasRole(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/submissions/[id]/timeline/route";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const SUBMISSION = {
  id: 1838,
  created_date_time: "2026-08-30T21:04:55.000Z",
  status: "completed",
};

/**
 * `analytics_event` is written by `persistAnalyticsEvent`, which returns early
 * without analytics consent — and most buyers decline. Of the 14 submissions
 * that reached Stripe since 2026-08-25, FIVE have no `begin_checkout` row at
 * all (1809, 1830, 1838, 1865, 1877 — three of whom paid), and NINE have no
 * `paywall_initiated`. Their admin timeline showed neither step, while the
 * funnel tab on the SAME submission — which reads `checkout_started_at` —
 * showed that they had checked out. One admin screen contradicting another
 * about one person is what prompted this.
 *
 * The route fills those gaps from the server-side stamps, but ONLY when the
 * client event is absent, so a consented reader's timeline is untouched and
 * nothing is listed twice.
 */
function route(opts: { analytics?: unknown[]; quotes?: unknown[] }) {
  mockSupabaseFetch.mockImplementation(async (path: string) => {
    if (path.includes("/survey_submission?")) return ok([SUBMISSION]);
    if (path.includes("/analytics_event?")) return ok(opts.analytics ?? []);
    if (path.includes("/report_price_quote?")) return ok(opts.quotes ?? []);
    // Every other source the timeline stitches together — empty is fine.
    return ok([]);
  });
}

const QUOTE_WITH_BOTH = {
  plan: "core",
  current_price: 41,
  currency: "EUR",
  paywall_reached_at: "2026-08-30T21:20:00.000Z",
  checkout_started_at: "2026-08-30T21:23:03.000Z",
};

async function labels(id = "1838") {
  const res = await GET(new Request("https://example.test/api/admin/submissions/1838/timeline"), {
    params: Promise.resolve({ id }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { events?: Array<{ label: string; type: string }> };
  return (body.events ?? []).map((e) => e.label);
}

describe("admin submission timeline — server-side paywall/checkout stamps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "ec@loveiq.org", role: "admin" });
    // resetAllMocks() clears return values too, so this has to be re-armed per test.
    mockHasRole.mockReturnValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("shows the checkout a consent-declining reader made", async () => {
    route({ analytics: [], quotes: [QUOTE_WITH_BOTH] });
    const found = await labels();
    expect(found).toContain("Sent to Stripe (server)");
    expect(found).toContain("Reached paywall (server)");
  });

  it("does not duplicate a step the client event already recorded", async () => {
    route({
      analytics: [
        { event_type: "begin_checkout", event_time: "2026-08-30T21:23:00.000Z", metadata: {} },
        { event_type: "paywall_initiated", event_time: "2026-08-30T21:20:00.000Z", metadata: {} },
      ],
      quotes: [QUOTE_WITH_BOTH],
    });
    const found = await labels();
    expect(found).toContain("Began checkout");
    expect(found).not.toContain("Sent to Stripe (server)");
    expect(found).not.toContain("Reached paywall (server)");
  });

  it("fills only the step that is actually missing", async () => {
    // Real shape for submissions 1827/1864/1866/1920: the checkout event landed,
    // the paywall one did not.
    route({
      analytics: [
        { event_type: "begin_checkout", event_time: "2026-08-30T21:23:00.000Z", metadata: {} },
      ],
      quotes: [QUOTE_WITH_BOTH],
    });
    const found = await labels();
    expect(found).toContain("Began checkout");
    expect(found).not.toContain("Sent to Stripe (server)");
    expect(found).toContain("Reached paywall (server)");
  });

  it("adds nothing when the reader never reached either step", async () => {
    route({
      analytics: [],
      quotes: [{ ...QUOTE_WITH_BOTH, paywall_reached_at: null, checkout_started_at: null }],
    });
    const found = await labels();
    expect(found).not.toContain("Sent to Stripe (server)");
    expect(found).not.toContain("Reached paywall (server)");
  });
});
