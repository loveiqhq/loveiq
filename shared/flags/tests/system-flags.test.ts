// R-06: F-12 kill-switch helper tests. Focus on cache + fail-open
// behaviour because that's the safety property — a broken flag system
// must not lock users out.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { isFeatureEnabled, __resetSystemFlagsCacheForTests } from "@shared/flags/system-flags";

describe("isFeatureEnabled (F-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    __resetSystemFlagsCacheForTests();
  });

  afterEach(() => {
    __resetSystemFlagsCacheForTests();
  });

  it("returns the stored value when Supabase reports enabled=true", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ enabled: true }],
    });
    await expect(isFeatureEnabled("survey_submissions")).resolves.toBe(true);
  });

  it("returns the stored value when Supabase reports enabled=false", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ enabled: false }],
    });
    await expect(isFeatureEnabled("survey_submissions")).resolves.toBe(false);
  });

  it("falls back to defaultWhenMissing when the flag row does not exist", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    await expect(isFeatureEnabled("nurture_sequence", true)).resolves.toBe(true);
  });

  it("fails OPEN to defaultWhenMissing on Supabase 5xx", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(isFeatureEnabled("survey_submissions", true)).resolves.toBe(true);
  });

  it("fails OPEN to defaultWhenMissing on fetch exception", async () => {
    mockFetchWithTimeout.mockRejectedValueOnce(new Error("network"));
    await expect(isFeatureEnabled("survey_submissions", true)).resolves.toBe(true);
  });

  it("caches within the TTL — second call does NOT hit Supabase", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ enabled: true }],
    });
    await isFeatureEnabled("survey_submissions");
    await isFeatureEnabled("survey_submissions");
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("__reset helper can pre-populate cache so tests skip the fetch", async () => {
    __resetSystemFlagsCacheForTests({ survey_submissions: false });
    await expect(isFeatureEnabled("survey_submissions")).resolves.toBe(false);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
