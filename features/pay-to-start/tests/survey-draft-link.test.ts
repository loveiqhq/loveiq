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

import { markEntitlementSurveyStarted } from "@features/pay-to-start/server/entitlement";

const TOKEN = `rpp_${"a".repeat(32)}`;
const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("a buyer's survey draft, linked to the purchase (email journeys' R1/R2)", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://db.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    mockFetchWithTimeout.mockReset();
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
  });

  it("stamps the first start once and links the draft whenever it differs", async () => {
    await markEntitlementSurveyStarted(TOKEN, SESSION);
    const calls = mockFetchWithTimeout.mock.calls.map(
      ([url, init]) => [String(url), JSON.parse(String((init as { body: string }).body))] as const
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toContain(
      `prepaid_token=eq.${TOKEN}&offer=not.is.null&paid_at=not.is.null&survey_started_at=is.null`
    );
    expect(calls[0]![1]).toHaveProperty("survey_started_at");
    expect(calls[1]![0]).toContain(
      `prepaid_token=eq.${TOKEN}&offer=not.is.null&paid_at=not.is.null&consumed_submission_id=is.null&or=(survey_session_id.is.null,survey_session_id.neq.${SESSION})`
    );
    expect(calls[1]![1]).toEqual({ survey_session_id: SESSION });
  });

  it("never puts anything but a draft's UUID into the filter", async () => {
    await markEntitlementSurveyStarted(TOKEN, "x),or=(id.gt.0");
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(String(mockFetchWithTimeout.mock.calls[0]![0])).not.toContain("survey_session_id");
  });

  it("does nothing for a token that is not a purchase's", async () => {
    await markEntitlementSurveyStarted("rpp_short", SESSION);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("never throws, whatever the database answers", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("timeout"));
    await expect(markEntitlementSurveyStarted(TOKEN, SESSION)).resolves.toBeUndefined();
  });
});
