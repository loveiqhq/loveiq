import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

const { getReportAccessPlanForSubmission } = await import("@features/report/server/personalReport");

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/**
 * Guards a latency fix, not a behaviour.
 *
 * `/api/report` calls `ensurePersonalReportForSubmission` (which reads the
 * `personal_report` row and returns it) and then immediately called
 * `getReportAccessPlanForSubmission`, which read the SAME row again — a wasted
 * Supabase round trip on every report view, on the hottest route we have.
 *
 * Time-based assertions would be flaky, so what is asserted is the thing that
 * actually costs the time: how many requests go out, and which.
 */
describe("getReportAccessPlanForSubmission — round trips", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  const urls = () => mockFetchWithTimeout.mock.calls.map((c) => String(c[0]));

  it("without a prefetched row it reads personal_report AND payment", async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(ok([{ id: 7, unlocked_archetypes: [], archetype_tiers: {} }]))
      .mockResolvedValueOnce(
        ok([{ id: 1, metadata: { plan: "full_report" }, payment_date_time: null }])
      );

    const res = await getReportAccessPlanForSubmission(42);

    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(urls().some((u) => u.includes("/personal_report?"))).toBe(true);
    expect(urls().some((u) => u.includes("/payment?"))).toBe(true);
    expect(res.accessPlan).toBe("full_report");
    expect(res.personalReportId).toBe(7);
  });

  it("with a prefetched row it reads ONLY payment — one round trip saved", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      ok([{ id: 1, metadata: { plan: "full_report" }, payment_date_time: null }])
    );

    const res = await getReportAccessPlanForSubmission(42, {
      id: 7,
      payment_id: null,
      payment_status: null,
      url: "/report/rpt_x",
      unlocked_archetypes: [],
      archetype_tiers: {},
    } as never);

    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(urls().some((u) => u.includes("/personal_report?"))).toBe(false);
    expect(urls()[0]).toContain("/payment?");
    expect(res.accessPlan).toBe("full_report");
    expect(res.personalReportId).toBe(7);
  });

  it("a prefetched null means 'no report' without re-reading it", async () => {
    const res = await getReportAccessPlanForSubmission(42, null);

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(res.accessPlan).toBeNull();
    expect(res.personalReportId).toBeNull();
  });
});
