import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  unlockAllArchetypesForPersonalReport: vi.fn(),
  upsertArchetypeTierForPersonalReport: vi.fn(),
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  markReportPriceQuotePurchased: vi.fn(),
}));

import { applyPrepaidEntitlementToReport } from "@features/checkout/server/fulfillment";
import {
  PREPAID_TOKEN_REGEX,
  generatePrepaidToken,
  hasSucceededPrepaidEntitlement,
  markPrepaidEntitlementRefunded,
  prepaidCookieOptions,
  type PrepaidEntitlement,
} from "@features/checkout/server/prepaidEntitlement";
import { upsertArchetypeTierForPersonalReport } from "@features/report/server/personalReport";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

const ARCHETYPE = KNOWN_ARCHETYPES[0]!;
const TOKEN = `rpp_${"a".repeat(32)}`;

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

function baseEntitlement(overrides: Partial<PrepaidEntitlement> = {}): PrepaidEntitlement {
  return {
    id: 7,
    prepaid_token: TOKEN,
    plan: "full_report",
    status: "succeeded",
    landing_variant: "white",
    stripe_session_id: "cs_test_1",
    stripe_payment_intent_id: "pi_test_1",
    payment_id: null,
    consumed_submission_id: null,
    amount_cents: 4999,
    currency: "EUR",
    ...overrides,
  };
}

interface CapturedApply {
  paymentPost: Record<string, unknown> | null;
  claimAttempted: boolean;
  reportPatch: boolean;
}

function setupApplyFetch({
  entitlement,
  primaryArchetype = null,
  userId,
}: {
  entitlement: PrepaidEntitlement | null;
  primaryArchetype?: string | null;
  userId: number | null;
}): CapturedApply {
  const captured: CapturedApply = { paymentPost: null, claimAttempted: false, reportPatch: false };

  mockFetchWithTimeout.mockImplementation(
    async (url: string, options: { body?: string; method?: string } = {}) => {
      const method = options.method ?? "GET";

      if (url.includes("/rest/v1/prepaid_report_access?prepaid_token=eq.")) {
        return jsonResponse(entitlement ? [entitlement] : []);
      }
      // Atomic CLAIM PATCH (filtered on consumed_submission_id=is.null). Models
      // the DB: returns 1 row iff the entitlement was still unconsumed.
      if (method === "PATCH" && url.includes("consumed_submission_id=is.null")) {
        captured.claimAttempted = true;
        return jsonResponse(
          entitlement?.consumed_submission_id == null ? [{ id: entitlement?.id }] : []
        );
      }
      // payment_id stamp PATCH (no is.null filter) — fire-and-forget.
      if (method === "PATCH" && url.includes("/rest/v1/prepaid_report_access?id=eq.")) {
        return jsonResponse([]);
      }
      if (url.includes("/rest/v1/survey_submission?id=eq.") && url.includes("select=user_id")) {
        return jsonResponse([{ user_id: userId }]);
      }
      if (url.includes("/rest/v1/scoring_result?")) {
        return jsonResponse(
          primaryArchetype
            ? [{ primary_archetype: primaryArchetype, v5_primary_archetype: primaryArchetype }]
            : []
        );
      }
      if (method === "POST" && url.endsWith("/rest/v1/payment")) {
        captured.paymentPost = JSON.parse(options.body ?? "{}") as Record<string, unknown>;
        return jsonResponse([{ id: 99 }]);
      }
      if (url.includes("/rest/v1/payment_item?payment_id=eq.")) {
        return jsonResponse([]);
      }
      if (method === "POST" && url.endsWith("/rest/v1/payment_item")) {
        return jsonResponse([{ id: 1 }]);
      }
      if (method === "PATCH" && url.includes("/rest/v1/personal_report?id=eq.")) {
        captured.reportPatch = true;
        return jsonResponse([]);
      }
      return jsonResponse([]);
    }
  );

  return captured;
}

describe("prepaid entitlement — token + cookie", () => {
  it("generatePrepaidToken matches the regex and is unique", () => {
    const a = generatePrepaidToken();
    const b = generatePrepaidToken();
    expect(a).toMatch(PREPAID_TOKEN_REGEX);
    expect(b).toMatch(PREPAID_TOKEN_REGEX);
    expect(a).not.toBe(b);
  });

  it("prepaidCookieOptions is httpOnly, lax, root path, and bounded lifetime", () => {
    const opts = prepaidCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBeGreaterThan(0);
  });
});

describe("hasSucceededPrepaidEntitlement (white survey gate)", () => {
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });
  afterEach(() => {
    process.env.SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it("returns false for a null/blank/malformed token WITHOUT hitting the DB", async () => {
    expect(await hasSucceededPrepaidEntitlement(null)).toBe(false);
    expect(await hasSucceededPrepaidEntitlement("")).toBe(false);
    expect(await hasSucceededPrepaidEntitlement("not-a-prepaid-token")).toBe(false);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("returns true only when a succeeded entitlement exists", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      jsonResponse([baseEntitlement({ status: "succeeded" })])
    );
    expect(await hasSucceededPrepaidEntitlement(TOKEN)).toBe(true);
  });

  it("returns false for a pending entitlement", async () => {
    mockFetchWithTimeout.mockResolvedValue(jsonResponse([baseEntitlement({ status: "pending" })]));
    expect(await hasSucceededPrepaidEntitlement(TOKEN)).toBe(false);
  });

  it("fails closed (false) when the lookup throws", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("network"));
    expect(await hasSucceededPrepaidEntitlement(TOKEN)).toBe(false);
  });
});

describe("applyPrepaidEntitlementToReport (unlock + loophole binding)", () => {
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.mocked(upsertArchetypeTierForPersonalReport).mockResolvedValue({});
  });
  afterEach(() => {
    process.env.SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it("unlocks: writes the payment row linked to the report, sets the full_report tier, consumes the entitlement", async () => {
    const captured = setupApplyFetch({ entitlement: baseEntitlement(), userId: 42 });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: "rpt_aaaaaaaaaaaaaaaaaaaa",
      submissionId: 5,
      token: TOKEN,
    });

    expect(result.applied).toBe(true);
    expect(captured.paymentPost).toMatchObject({
      personal_report_id: 5,
      status: "succeeded",
      user_id: 42,
    });
    const metadata = captured.paymentPost?.metadata as Record<string, unknown>;
    expect(metadata.plan).toBe("full_report");
    expect(metadata.prepaid).toBe("true");
    expect(captured.reportPatch).toBe(true);
    expect(captured.claimAttempted).toBe(true);
    expect(upsertArchetypeTierForPersonalReport).toHaveBeenCalledWith(
      expect.objectContaining({ personalReportId: 5, tier: "full_report", archetype: ARCHETYPE })
    );
  });

  it("is idempotent for the SAME submission: lost claim → NO duplicate payment row", async () => {
    const captured = setupApplyFetch({
      // Already consumed by this same submission (a prior run / concurrent twin).
      entitlement: baseEntitlement({ consumed_submission_id: 5, payment_id: 77 }),
      userId: 42,
    });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    // Returns the existing payment id and writes NO second payment row.
    expect(result).toEqual({ applied: true, paymentId: 77 });
    expect(captured.paymentPost).toBeNull();
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
  });

  it("REFUSES reuse on a different submission — no payment, report stays locked", async () => {
    const captured = setupApplyFetch({
      entitlement: baseEntitlement({ consumed_submission_id: 999 }),
      userId: 42,
    });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    expect(result).toEqual({ applied: false, reason: "consumed_other" });
    expect(captured.paymentPost).toBeNull();
    expect(captured.claimAttempted).toBe(false);
    expect(upsertArchetypeTierForPersonalReport).not.toHaveBeenCalled();
  });

  it("refuses when the entitlement is not paid (pending)", async () => {
    const captured = setupApplyFetch({
      entitlement: baseEntitlement({ status: "pending" }),
      userId: 42,
    });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    expect(result).toEqual({ applied: false, reason: "not_paid" });
    expect(captured.paymentPost).toBeNull();
  });

  it("refuses when no entitlement matches the token", async () => {
    const captured = setupApplyFetch({ entitlement: null, userId: 42 });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    expect(result).toEqual({ applied: false, reason: "no_entitlement" });
    expect(captured.paymentPost).toBeNull();
  });

  it("refuses (no payment) when the submission has no user_id", async () => {
    const captured = setupApplyFetch({ entitlement: baseEntitlement(), userId: null });

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    expect(result).toEqual({ applied: false, reason: "missing_user" });
    expect(captured.paymentPost).toBeNull();
  });

  it("concurrent race: entitlement looked unconsumed but the claim is LOST to a different submission → refuses, no payment", async () => {
    // Models a TOCTOU: the first read sees it unconsumed (passes the early
    // guard), the atomic claim PATCH matches 0 rows (another submission won
    // between read and claim), and the re-read shows a DIFFERENT submission.
    let findCalls = 0;
    let paymentPosted = false;
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options: { body?: string; method?: string } = {}) => {
        const method = options.method ?? "GET";
        if (url.includes("/rest/v1/prepaid_report_access?prepaid_token=eq.")) {
          findCalls += 1;
          return jsonResponse([
            baseEntitlement({ consumed_submission_id: findCalls >= 2 ? 888 : null }),
          ]);
        }
        if (url.includes("select=user_id")) return jsonResponse([{ user_id: 42 }]);
        if (method === "PATCH" && url.includes("consumed_submission_id=is.null")) {
          return jsonResponse([]); // lost the claim
        }
        if (method === "POST" && url.endsWith("/rest/v1/payment")) {
          paymentPosted = true;
          return jsonResponse([{ id: 1 }]);
        }
        return jsonResponse([]);
      }
    );

    const result = await applyPrepaidEntitlementToReport({
      archetype: ARCHETYPE,
      personalReportId: 5,
      reportToken: null,
      submissionId: 5,
      token: TOKEN,
    });

    expect(result).toEqual({ applied: false, reason: "consumed_other" });
    expect(paymentPosted).toBe(false);
  });
});

describe("markPrepaidEntitlementRefunded (refund/dispute invalidation)", () => {
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });
  afterEach(() => {
    process.env.SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it("flips a succeeded entitlement to refunded, scoped by payment intent + status", async () => {
    let patched: { url: string; body: Record<string, unknown> } | null = null;
    mockFetchWithTimeout.mockImplementation(
      async (url: string, options: { body?: string; method?: string } = {}) => {
        if (options.method === "PATCH") {
          patched = { url, body: JSON.parse(options.body ?? "{}") as Record<string, unknown> };
        }
        return jsonResponse([]);
      }
    );

    await markPrepaidEntitlementRefunded("pi_test_123");

    expect(patched).not.toBeNull();
    expect(patched!.url).toContain("stripe_payment_intent_id=eq.pi_test_123");
    expect(patched!.url).toContain("status=eq.succeeded");
    expect(patched!.body.status).toBe("refunded");
  });

  it("is a no-op for a null payment intent and never throws on error", async () => {
    let patchCalls = 0;
    mockFetchWithTimeout.mockImplementation(
      async (_url: string, options: { method?: string } = {}) => {
        if (options.method === "PATCH") patchCalls += 1;
        return jsonResponse([], false);
      }
    );

    await markPrepaidEntitlementRefunded(null);
    expect(patchCalls).toBe(0);

    // A failing PATCH must be swallowed (refund handler already did its work).
    await expect(markPrepaidEntitlementRefunded("pi_x")).resolves.toBeUndefined();
  });
});
