import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...a),
}));

import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * Searches count against their own breaker. With one breaker for every read, three slow
 * searches in a row opened it for 30 seconds and every other tool failed with them.
 */
describe("supabaseFetch: which breaker a call counts against", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://db.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    mockFetch.mockReset();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("keeps the shared breaker closed while a named one opens", async () => {
    mockFetch.mockRejectedValue(new Error("Request timeout after 15000ms"));
    for (let i = 0; i < 3; i++) {
      await expect(
        supabaseFetch("/rest/v1/rpc/brain_search", { breaker: "test-search" })
      ).rejects.toThrow("Request timeout");
    }
    // Open: the fourth search is refused without going out at all.
    mockFetch.mockClear();
    await expect(
      supabaseFetch("/rest/v1/rpc/brain_search", { breaker: "test-search" })
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
    // Every other read still goes out, on the shared breaker.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
    });
    const res = await supabaseFetch("/rest/v1/brain_person?select=canonical");
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * The admin login and Jarvis's sign-in codes call Auth through supabaseFetch too, so the
 * path decides the address: SUPABASE_AUTH_URL for `/auth/v1/`, SUPABASE_REST_URL for the rest.
 */
describe("supabaseFetch: which address a call goes to", () => {
  const ok = { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
  const urls = () => mockFetch.mock.calls.map(([url]) => url);
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(ok);
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends both to SUPABASE_URL while the overrides are unset", async () => {
    await supabaseFetch("/rest/v1/payment?select=id");
    await supabaseFetch("/auth/v1/admin/users", { method: "POST", body: "{}" });
    expect(urls()).toEqual([
      "https://proj.supabase.co/rest/v1/payment?select=id",
      "https://proj.supabase.co/auth/v1/admin/users",
    ]);
  });

  it("sends the data API and Auth to their own addresses when set", async () => {
    vi.stubEnv("SUPABASE_REST_URL", "https://db.example");
    vi.stubEnv("SUPABASE_AUTH_URL", "https://auth.example");
    await supabaseFetch("/rest/v1/payment?select=id");
    await supabaseFetch("/auth/v1/admin/generate_link", { method: "POST", body: "{}" });
    expect(urls()).toEqual([
      "https://db.example/rest/v1/payment?select=id",
      "https://auth.example/auth/v1/admin/generate_link",
    ]);
  });
});
