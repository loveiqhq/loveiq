import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crypto for deterministic nonce generation
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-1234-5678-9abc-def012345678",
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i % 256;
    return arr;
  },
  subtle: {
    digest: async () => new Uint8Array(Array.from({ length: 32 }, (_, index) => index)).buffer,
  },
});

// Mock pino logger (path relative to THIS test file)
vi.mock("@shared/observability/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock next/server
const { mockCookiesSet, mockCookiesDelete, mockRedirect, mockJson, mockResponseHeaders } =
  vi.hoisted(() => ({
    mockResponseHeaders: new Map<string, string>(),
    mockCookiesSet: vi.fn(),
    mockCookiesDelete: vi.fn(),
    mockRedirect: vi.fn((url: URL) => ({
      redirectedTo: url.toString(),
      cookies: { delete: vi.fn() },
    })),
    mockJson: vi.fn((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      cookies: { set: vi.fn(), delete: vi.fn() },
    })),
  }));

vi.mock("next/server", () => {
  return {
    NextResponse: {
      next: vi.fn((_opts?: unknown) => ({
        headers: {
          set: (key: string, value: string) => mockResponseHeaders.set(key, value),
          get: (key: string) => mockResponseHeaders.get(key),
        },
        cookies: {
          set: mockCookiesSet,
          delete: mockCookiesDelete,
        },
      })),
      redirect: mockRedirect,
      json: mockJson,
    },
  };
});

// Admin gate Supabase mock. Default: no user (anonymous). Admin-path tests
// override mockGetUser to return an authenticated user. Non-admin tests never
// reach createSupabaseMiddleware, so this default is inert for them.
const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as { email?: string } | null } })),
}));
vi.mock("@shared/auth/supabase-middleware", () => ({
  createSupabaseMiddleware: () => ({ auth: { getUser: mockGetUser } }),
}));

import { proxy } from "@/proxy";
import logger from "@shared/observability/logger";

function makeNextRequest(
  url = "http://localhost:3000/",
  cookieValue?: string,
  visitorIdCookie?: string,
  /**
   * T-02: when set, supplies a `cookieyes-consent` cookie value. Tests that
   * want to verify the post-consent mint behaviour pass `"analytics:yes"`
   * here. Default = no consent cookie present.
   */
  consentCookieValue?: string,
  /**
   * R-13: supplies a `__admin_activity` cookie value (epoch-ms string) for
   * admin idle-timeout tests. Default = absent.
   */
  adminActivityValue?: string
) {
  // Use a real Headers object so `new Headers(request.headers)` works
  const headers = new Headers();
  headers.set("user-agent", "TestAgent/1.0");
  headers.set("x-real-ip", "1.2.3.4");

  return {
    method: "GET",
    headers,
    url,
    cookies: {
      get: (name: string) => {
        // In test (NODE_ENV=test !== "production"), cookie name is "__csrf"
        if (name === "__csrf" && cookieValue) return { value: cookieValue };
        if (name === "__Host-csrf" && cookieValue) return { value: cookieValue };
        if (name === "staging_session" && cookieValue) return { value: cookieValue };
        if (name === "__liq_vid" && visitorIdCookie) return { value: visitorIdCookie };
        if (name === "__Host-liq_vid" && visitorIdCookie) return { value: visitorIdCookie };
        if (name === "cookieyes-consent" && consentCookieValue) {
          return { value: consentCookieValue };
        }
        if (name === "__admin_activity" && adminActivityValue) {
          return { value: adminActivityValue };
        }
        return undefined;
      },
    },
    nextUrl: {
      pathname: new URL(url).pathname,
      search: new URL(url).search,
    },
  } as never;
}

describe("proxy middleware", () => {
  beforeEach(() => {
    mockResponseHeaders.clear();
    mockCookiesSet.mockClear();
    mockCookiesDelete.mockClear();
    mockRedirect.mockClear();
    mockJson.mockClear();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: null } });
    (logger.info as ReturnType<typeof vi.fn>).mockClear();
    delete process.env.STAGING_PASSWORD;
  });

  it("sets Content-Security-Policy header", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src");
    expect(csp).toContain("googletagmanager.com");
  });

  it("sets X-Frame-Options to DENY", () => {
    proxy(makeNextRequest());
    expect(mockResponseHeaders.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    proxy(makeNextRequest());
    expect(mockResponseHeaders.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Strict-Transport-Security with preload-eligible attrs (R-12)", () => {
    proxy(makeNextRequest());
    const hsts = mockResponseHeaders.get("Strict-Transport-Security");
    // 2 years + includeSubDomains + preload = the trio required to submit
    // to hstspreload.org. See proxy.ts comment for the rationale.
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("sets Referrer-Policy", () => {
    proxy(makeNextRequest());
    expect(mockResponseHeaders.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy", () => {
    proxy(makeNextRequest());
    const pp = mockResponseHeaders.get("Permissions-Policy");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("camera=()");
  });

  it("sets Cross-Origin-Opener-Policy", () => {
    proxy(makeNextRequest());
    expect(mockResponseHeaders.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
  });

  it("sets CSRF cookie when not present", () => {
    proxy(makeNextRequest());
    expect(mockCookiesSet).toHaveBeenCalledWith(
      "__csrf",
      expect.any(String),
      expect.objectContaining({
        httpOnly: false,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      })
    );
  });

  it("does not set CSRF cookie when already present", () => {
    proxy(
      makeNextRequest(
        "http://localhost:3000/",
        "existing-token",
        "550e8400-e29b-41d4-a716-446655440000"
      )
    );
    const csrfCall = mockCookiesSet.mock.calls.find(
      (call) => call[0] === "__csrf" || call[0] === "__Host-csrf"
    );
    expect(csrfCall).toBeUndefined();
  });

  it("T-02: does NOT mint __liq_vid before analytics consent", () => {
    proxy(makeNextRequest());
    const visitorCall = mockCookiesSet.mock.calls.find(
      (call) => call[0] === "__liq_vid" || call[0] === "__Host-liq_vid"
    );
    expect(visitorCall).toBeUndefined();
  });

  it("mints __liq_vid after CookieYes analytics consent is granted (T-02)", () => {
    proxy(makeNextRequest("http://localhost:3000/", undefined, undefined, "analytics:yes"));
    expect(mockCookiesSet).toHaveBeenCalledWith(
      "__liq_vid",
      "test-uuid-1234-5678-9abc-def012345678",
      expect.objectContaining({
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      })
    );
  });

  it("does NOT mint __liq_vid when consent says analytics:no (T-02)", () => {
    proxy(makeNextRequest("http://localhost:3000/", undefined, undefined, "analytics:no"));
    const visitorCall = mockCookiesSet.mock.calls.find(
      (call) => call[0] === "__liq_vid" || call[0] === "__Host-liq_vid"
    );
    expect(visitorCall).toBeUndefined();
  });

  it("does not re-mint __liq_vid when a valid UUID cookie is already present", () => {
    proxy(
      makeNextRequest("http://localhost:3000/", undefined, "550e8400-e29b-41d4-a716-446655440000")
    );
    const visitorCall = mockCookiesSet.mock.calls.find(
      (call) => call[0] === "__liq_vid" || call[0] === "__Host-liq_vid"
    );
    expect(visitorCall).toBeUndefined();
  });

  it("re-mints __liq_vid when the existing value is malformed AND consent is granted (T-02)", () => {
    proxy(makeNextRequest("http://localhost:3000/", undefined, "not-a-uuid", "analytics:yes"));
    const visitorCall = mockCookiesSet.mock.calls.find(
      (call) => call[0] === "__liq_vid" || call[0] === "__Host-liq_vid"
    );
    expect(visitorCall).toBeDefined();
  });

  it("logs API requests via logger", () => {
    proxy(makeNextRequest("http://localhost:3000/api/contact"));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "api_request",
        path: "/api/contact",
      })
    );
  });

  it("does not log non-API requests", () => {
    proxy(makeNextRequest("http://localhost:3000/about"));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("CSP includes recaptcha domains", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toContain("www.google.com/recaptcha/");
    expect(csp).toContain("www.gstatic.com/recaptcha/");
  });

  it("CSP includes Stripe domains for embedded checkout", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("https://api.stripe.com");
    expect(csp).toContain("https://hooks.stripe.com");
    expect(csp).toContain("https://checkout.stripe.com");
  });

  it("CSP includes Google Fonts for Stripe iframe typography", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });

  it("CSP includes frame-ancestors 'none'", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows /api/health through the staging gate", async () => {
    process.env.STAGING_PASSWORD = "test-staging-pw";

    await proxy(makeNextRequest("http://localhost:3000/api/health"));

    expect(mockResponseHeaders.get("X-Frame-Options")).toBe("DENY");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "api_request",
        path: "/api/health",
      })
    );
  });

  it("allows /api/stripe/webhook through the staging gate", async () => {
    process.env.STAGING_PASSWORD = "test-staging-pw";

    await proxy(makeNextRequest("http://localhost:3000/api/stripe/webhook"));

    expect(mockResponseHeaders.get("X-Frame-Options")).toBe("DENY");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "api_request",
        path: "/api/stripe/webhook",
      })
    );
  });

  it("redirects staging-gated requests to login with the original path preserved", async () => {
    process.env.STAGING_PASSWORD = "test-staging-pw";

    await proxy(
      makeNextRequest(
        "http://localhost:3000/checkout/return?plan=full_report&session_id=cs_test_123"
      )
    );

    expect(mockRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "http://localhost:3000/login?next=%2Fcheckout%2Freturn%3Fplan%3Dfull_report%26session_id%3Dcs_test_123",
      })
    );
  });

  // R-13: admin idle-timeout gate. The admin gate previously had no middleware
  // test coverage at all. These pin the security-critical invariant that the
  // `__admin_activity` cookie must outlive the Supabase session (maxAge 7d) so
  // the 30-min idle check can never be silently skipped by a missing cookie.
  describe("admin idle timeout (R-13)", () => {
    const adminUrl = "http://localhost:3000/admin/dashboard";

    it("re-stamps __admin_activity with a 7-day maxAge on active admin requests", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { email: "admin@loveiq.org" } } });
      const fiveMinAgo = String(Date.now() - 5 * 60 * 1000);

      await proxy(makeNextRequest(adminUrl, undefined, undefined, undefined, fiveMinAgo));

      const activityCall = mockCookiesSet.mock.calls.find((call) => call[0] === "__admin_activity");
      expect(activityCall).toBeDefined();
      // The fix: maxAge must be 7d, NOT 1h. A 1h cookie would expire before the
      // Supabase session, letting a >1h-idle request slip past the idle check.
      expect(activityCall![2]).toEqual(
        expect.objectContaining({ httpOnly: true, maxAge: 7 * 24 * 60 * 60 })
      );
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("forces re-auth (redirect) when the last activity is older than 30 minutes", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { email: "admin@loveiq.org" } } });
      const fortyMinAgo = String(Date.now() - 40 * 60 * 1000);

      await proxy(makeNextRequest(adminUrl, undefined, undefined, undefined, fortyMinAgo));

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining("error=idle_timeout") })
      );
    });

    it("returns 401 JSON (not a redirect) for idle /api/admin/* callers", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { email: "admin@loveiq.org" } } });
      const fortyMinAgo = String(Date.now() - 40 * 60 * 1000);

      const res = await proxy(
        makeNextRequest(
          "http://localhost:3000/api/admin/stats",
          undefined,
          undefined,
          undefined,
          fortyMinAgo
        )
      );

      expect((res as unknown as { status: number }).status).toBe(401);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
