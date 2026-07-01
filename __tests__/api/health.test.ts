import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../__fixtures__/msw-server";

import { GET } from "../../app/api/health/route";

// `/api/health` is publicly reachable (uptime monitors, load balancers).
// The response body must NOT reveal which env vars are missing or which
// services are configured — that's a deployment-fingerprinting leak. The
// tests below pin the minimal `{ ok: boolean }` contract; diagnostic detail
// must stay in server logs only.
//
// This file is the MSW-migration reference. Pattern: register URL-scoped
// handlers via `server.use(...)` inside each test, instead of a
// global `vi.mock("@shared/http/fetch-with-timeout")`. MSW intercepts the native
// `fetch` call inside `fetchWithTimeout`, so the wrapper is exercised end-to-
// end.

const okSupabase = http.get("https://test.supabase.co/rest/v1/", () =>
  HttpResponse.json({}, { status: 200 })
);
const okResend = http.get("https://api.resend.com/api-keys", () =>
  HttpResponse.json({ data: [] }, { status: 200 })
);

describe("GET /api/health", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("returns 200 with only { ok: true } when all checks pass", async () => {
    server.use(okSupabase, okResend);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("returns 503 when Supabase returns non-ok status", async () => {
    server.use(
      http.get("https://test.supabase.co/rest/v1/", () =>
        HttpResponse.json({ error: "boom" }, { status: 503 })
      ),
      okResend
    );

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("returns 503 when Supabase ping throws", async () => {
    server.use(
      http.get("https://test.supabase.co/rest/v1/", () => HttpResponse.error()),
      okResend
    );

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  // Resend/Stripe/KV are NOT liveness-critical — a transient blip in any of them
  // leaves the site fully usable (email is after-response, checkout is togglable,
  // the rate limiter falls back to in-memory). They must NOT flip the probe to
  // 503 (that caused a false "site down" page on 2026-07-01 during a Resend blip).
  it("returns 200 (degraded, not down) when Resend is unreachable", async () => {
    server.use(
      okSupabase,
      http.get("https://api.resend.com/api-keys", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 })
      )
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 (degraded, not down) when KV is configured but unreachable", async () => {
    process.env.KV_REST_API_URL = "https://kv.test.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv_test";
    server.use(
      okSupabase,
      okResend,
      http.get("https://kv.test.upstash.io/ping", () => HttpResponse.error())
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 (degraded, not down) when Stripe is configured but unreachable", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    server.use(
      okSupabase,
      okResend,
      http.get("https://api.stripe.com/v1/balance", () => HttpResponse.error())
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 when KV is unconfigured (in-memory fallback active)", async () => {
    server.use(okSupabase, okResend);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does NOT leak which env var is missing in the public response", async () => {
    delete process.env.RESEND_API_KEY;
    server.use(okSupabase);

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json).toEqual({ ok: false });
    // Response must contain no env var names, no service-status fields.
    expect(JSON.stringify(json)).not.toMatch(/RESEND|SUPABASE|env|resend|supabase|kv/i);
  });

  it("returns 503 when SUPABASE_URL is absent", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
