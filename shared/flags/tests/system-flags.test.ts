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

import {
  areFeaturesEnabled,
  isFeatureEnabled,
  readFeatureFlag,
  __resetSystemFlagsCacheForTests,
} from "@shared/flags/system-flags";

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

describe("readFeatureFlag: for a caller that must not guess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    __resetSystemFlagsCacheForTests();
  });

  it("answers the row's value, and whenMissing when there is no row", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [{ enabled: true }] });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBe(true);
    __resetSystemFlagsCacheForTests();
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBe(false);
  });

  it("answers null, never the default, when Supabase errors, throws or answers no list", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBeNull();
    mockFetchWithTimeout.mockRejectedValueOnce(new Error("timeout"));
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBeNull();
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBeNull();
  });

  it("caches what it read, never a failure", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503 });
    await readFeatureFlag("report_initial_unlock_gate", false);
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [{ enabled: true }] });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBe(true);
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBe(true);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it("is not fooled by isFeatureEnabled's default cached after a failure", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(isFeatureEnabled("report_initial_unlock_gate", false)).resolves.toBe(false);
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(readFeatureFlag("report_initial_unlock_gate", false)).resolves.toBeNull();
  });
});

describe("areFeaturesEnabled: several flags, one request", () => {
  const KEYS = [
    "survey_sheet_science",
    "survey_sheet_desire",
    "report_gate_archetype_reveal",
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    __resetSystemFlagsCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetSystemFlagsCacheForTests();
  });

  it("asks once for all of them, in order, a missing row read as the default", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { key: "survey_sheet_desire", enabled: true },
        { key: "report_gate_archetype_reveal", enabled: false },
      ],
    });
    await expect(areFeaturesEnabled(KEYS, false)).resolves.toEqual([false, true, false]);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    const url = new URL(mockFetchWithTimeout.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/rest/v1/system_flags");
    expect(url.searchParams.get("key")).toBe(`in.(${KEYS.join(",")})`);
  });

  it("fills isFeatureEnabled's cache, so neither asks again within the TTL", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ key: "survey_sheet_science", enabled: true }],
    });
    await areFeaturesEnabled(KEYS, false);
    await expect(areFeaturesEnabled(KEYS, false)).resolves.toEqual([true, false, false]);
    await expect(isFeatureEnabled("survey_sheet_science", false)).resolves.toBe(true);
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it("asks only for the flags it does not already hold", async () => {
    __resetSystemFlagsCacheForTests({ survey_sheet_science: true });
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await expect(areFeaturesEnabled(KEYS, false)).resolves.toEqual([true, false, false]);
    const url = new URL(mockFetchWithTimeout.mock.calls[0]![0] as string);
    expect(url.searchParams.get("key")).toBe(
      "in.(survey_sheet_desire,report_gate_archetype_reveal)"
    );
  });

  it("answers the default for every flag when Supabase errors or cannot be reached", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    await expect(areFeaturesEnabled(KEYS, false)).resolves.toEqual([false, false, false]);
    __resetSystemFlagsCacheForTests();
    mockFetchWithTimeout.mockRejectedValueOnce(new Error("timeout"));
    await expect(areFeaturesEnabled(KEYS, true)).resolves.toEqual([true, true, true]);
  });

  it("honours an environment override without asking for it", async () => {
    vi.stubEnv("SYSTEM_FLAG_survey_sheet_desire", "true");
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await expect(areFeaturesEnabled(KEYS, false)).resolves.toEqual([false, true, false]);
    const url = new URL(mockFetchWithTimeout.mock.calls[0]![0] as string);
    expect(url.searchParams.get("key")).toBe(
      "in.(survey_sheet_science,report_gate_archetype_reveal)"
    );
  });
});
