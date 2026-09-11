import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchWithTimeout, mockLogger } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/observability/logger", () => ({ default: mockLogger }));
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => unknown) => fn() }),
}));

const ok = (body: unknown = {}) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as
    Response | never;

/**
 * The consent stamp (`consent_at` + `terms_version`) is the GDPR Art. 5(2) accountability
 * record, and it shares one PATCH with `option_order`. PostgREST rejects the WHOLE body
 * when a column is missing from its schema cache, migrations here are applied by hand
 * rather than by CI, and `fetch` does not throw on a 4xx — so a deploy landing before
 * `20260911102618_survey_submission_option_order.sql` would have dropped the consent
 * record on every submission with nothing logged.
 */
describe("consent patch survives a missing option_order column", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchWithTimeout.mockReset();
    mockLogger.warn.mockReset();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  async function submitWith(patchResponses: Array<() => unknown>) {
    const { submitSurveyOnce } = await import("@features/survey/server/server");
    const patchBodies: string[] = [];
    let patchCount = 0;

    mockFetchWithTimeout.mockImplementation(
      (url: string, init: { method?: string; body?: string }) => {
        if (init?.method === "PATCH") {
          patchBodies.push(String(init.body));
          const next = patchResponses[patchCount] ?? (() => ok());
          patchCount += 1;
          return Promise.resolve(next());
        }
        // submit_survey RPC and any lookup
        if (url.includes("/rpc/submit_survey")) return Promise.resolve(ok(42));
        return Promise.resolve(ok([]));
      }
    );

    await submitSurveyOnce({
      email: "probe@loveiq.org",
      firstName: "Probe",
      answers: { "00000": "probe@loveiq.org" },
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      utmTracker: null,
      sessionId: "11111111-1111-1111-1111-111111111111",
      optionOrder: { "16001": ["B", "A"] },
    } as never);

    return { patchBodies, patchCount };
  }

  const pgrst204 = () =>
    ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          code: "PGRST204",
          message:
            "Could not find the 'option_order' column of 'survey_submission' in the schema cache",
        }),
    }) as never;

  it("retries without option_order and still stamps consent", async () => {
    const { patchBodies, patchCount } = await submitWith([pgrst204, () => ok()]);

    expect(patchCount).toBe(2);
    // First attempt carried the order; the retry dropped it but kept the consent record.
    expect(patchBodies[0]).toContain("option_order");
    expect(patchBodies[1]).not.toContain("option_order");
    expect(patchBodies[1]).toContain("consent_at");
    expect(patchBodies[1]).toContain("terms_version");
  });

  it("does not retry when the patch succeeds", async () => {
    const { patchCount } = await submitWith([() => ok()]);
    expect(patchCount).toBe(1);
  });

  it("does not silently swallow an HTTP failure — it logs", async () => {
    // The original hole: fetch does not reject on 4xx, so the catch never ran and an
    // HTTP rejection produced no log line at all.
    await submitWith([
      () => ({ ok: false, status: 500, text: async () => "boom" }) as never,
      () => ok(),
    ]);
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
