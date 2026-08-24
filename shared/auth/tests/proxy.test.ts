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
const {
  mockCookiesSet,
  mockCookiesDelete,
  mockRedirect,
  mockJson,
  mockResponseHeaders,
  mockNextOpts,
} = vi.hoisted(() => ({
  mockResponseHeaders: new Map<string, string>(),
  mockCookiesSet: vi.fn(),
  mockCookiesDelete: vi.fn(),
  // Captures the request headers passed to NextResponse.next({ request: { headers } })
  // so tests can assert the cloned-request header injection (e.g. x-landing-variant).
  mockNextOpts: { value: null as { request?: { headers?: Headers } } | null },
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
      next: vi.fn((opts?: { request?: { headers?: Headers } }) => {
        mockNextOpts.value = opts ?? null;
        return {
          headers: {
            set: (key: string, value: string) => mockResponseHeaders.set(key, value),
            get: (key: string) => mockResponseHeaders.get(key),
          },
          cookies: {
            set: mockCookiesSet,
            delete: mockCookiesDelete,
          },
        };
      }),
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

import { proxy, shouldCountVisit } from "@/proxy";
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
  adminActivityValue?: string,
  /** White-landing A/B: supplies an existing `__liq_lv` cookie value. */
  landingCookie?: string,
  /** Override the User-Agent (e.g. a bot UA for the SEO-control test). */
  userAgent?: string
) {
  // Use a real Headers object so `new Headers(request.headers)` works
  const headers = new Headers();
  headers.set("user-agent", userAgent ?? "TestAgent/1.0");
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
        if ((name === "__liq_lv" || name === "__Host-liq_lv") && landingCookie) {
          return { value: landingCookie };
        }
        return undefined;
      },
    },
    nextUrl: {
      pathname: new URL(url).pathname,
      search: new URL(url).search,
      searchParams: new URL(url).searchParams,
    },
  } as never;
}

describe("proxy middleware", () => {
  beforeEach(() => {
    mockResponseHeaders.clear();
    mockNextOpts.value = null;
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

  /**
   * Regression: connect-src never listed supabase.co, so the admin panel's
   * PagePresence Realtime socket was refused. Chromium fails it silently, but
   * Safari throws a SecurityError out of the WebSocket constructor, which escaped
   * the effect and replaced every admin page with the app error boundary.
   */
  it("allows the Supabase Realtime socket in connect-src, over https and wss", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy") ?? "";
    const connectSrc = csp.split(";").find((part) => part.trim().startsWith("connect-src")) ?? "";
    expect(connectSrc).toContain("https://abcdefgh.supabase.co");
    // the WebSocket needs the wss scheme explicitly — an https entry does not cover it
    expect(connectSrc).toContain("wss://abcdefgh.supabase.co");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("omits the Supabase entry rather than throwing when the URL is unusable", () => {
    // middleware runs on every request: a malformed value must not 500 the site
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    expect(() => proxy(makeNextRequest())).not.toThrow();
    const csp = mockResponseHeaders.get("Content-Security-Policy") ?? "";
    expect(csp).not.toContain("wss://not a url");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
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

  // Regression guard: these hosts were missing for a long time, so GA4 and Ads
  // /collect calls were refused by CSP and the numbers were silently lossy.
  // A dropped entry here loses analytics data without failing any build.
  it("CSP includes every GA4 + Google Ads measurement endpoint", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    for (const host of [
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://analytics.google.com",
      "https://*.analytics.google.com",
      "https://googleads.g.doubleclick.net",
      "https://stats.g.doubleclick.net",
      "https://ad.doubleclick.net",
      "https://pagead2.googlesyndication.com",
    ]) {
      expect(csp).toContain(host);
    }
  });

  it("CSP includes the configured PostHog host and a blob: worker source", () => {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    // The SDK pulls the recorder/assets from sibling subdomains, and session
    // replay needs a blob: worker (which default-src 'self' would block).
    expect(csp).toContain("https://eu.i.posthog.com");
    expect(csp).toContain("https://*.posthog.com");
    expect(csp).toContain("worker-src 'self' blob:");
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  it("survives an unparseable NEXT_PUBLIC_POSTHOG_HOST instead of 500ing", () => {
    // This runs in middleware on every request, so a bad env value must
    // degrade to "no PostHog CSP entry", never throw.
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "eu.i.posthog.com";
    expect(() => proxy(makeNextRequest())).not.toThrow();
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("posthog.com");
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  it("CSP allows Google Ads remarketing pixels on local country domains", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy");
    // CSP cannot wildcard a TLD, so these are enumerated. A few representative
    // markets, including .ba (our own region) which we caught being blocked.
    for (const host of [
      "https://www.google.de",
      "https://www.google.fr",
      "https://www.google.co.uk",
      "https://www.google.ba",
    ]) {
      expect(csp).toContain(host);
    }
  });

  it("keeps the CSP header within a sane size budget", () => {
    proxy(makeNextRequest());
    const csp = mockResponseHeaders.get("Content-Security-Policy") ?? "";
    // This header goes out on every page and API response. Enumerating all ~190
    // Google country domains measured at 6.7KB; the curated list is ~3.4KB.
    // If this trips, something re-inflated the allowlist — trim it rather than
    // raising the ceiling.
    expect(csp.length).toBeLessThan(4500);
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

  // The signed digest-image edge route lives under /api/admin/ but is fetched
  // by Slack's ANONYMOUS image proxy and self-authorizes via an HMAC signature
  // in the URL. It must bypass the admin session gate, or the funnel-digest
  // charts render as broken images (Slack gets 401). Regression guard for the
  // 2026-05-31 fix.
  describe("admin gate exemption: signed digest-image route", () => {
    it("lets the anonymous Slack proxy reach /api/admin/digest-image/* (not session-gated)", async () => {
      // Default mockGetUser = anonymous; the route authorizes via the URL signature.
      await proxy(
        makeNextRequest("http://localhost:3000/api/admin/digest-image/cvr-visitor-start?d=x&s=y")
      );
      expect(mockJson).not.toHaveBeenCalled(); // no 401 Unauthorized
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockResponseHeaders.get("X-Frame-Options")).toBe("DENY"); // passed through
    });

    it("still blocks an unauthenticated non-exempt /api/admin route with 401", async () => {
      const res = await proxy(makeNextRequest("http://localhost:3000/api/admin/stats"));
      expect((res as unknown as { status: number }).status).toBe(401);
    });
  });
});

describe("proxy middleware — landing A/B (__liq_lv)", () => {
  beforeEach(() => {
    mockResponseHeaders.clear();
    mockNextOpts.value = null;
    mockCookiesSet.mockClear();
    delete process.env.STAGING_PASSWORD;
  });

  const landingCookieCalls = () =>
    mockCookiesSet.mock.calls.filter((c) => c[0] === "__liq_lv" || c[0] === "__Host-liq_lv");
  const variantHeader = () => mockNextOpts.value?.request?.headers?.get("x-landing-variant");

  it("assigns one of the two live arms on / and mints it as a sticky cookie", async () => {
    await proxy(makeNextRequest("http://localhost:3000/"));
    // Round 2 is current-white vs previous-white, 50/50 — either is valid here,
    // and the distribution itself is asserted below.
    expect(["white", "white_prev"]).toContain(variantHeader());
    const calls = landingCookieCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe(variantHeader());
    expect(calls[0]![2]).toEqual(
      expect.objectContaining({ path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
    );
  });

  it("maps the coin flip to both arms", async () => {
    // `crypto.getRandomValues` is stubbed deterministically at the top of this file
    // (byte 0 = 0), so a plain loop would only ever exercise one side. Drive the
    // byte directly instead: even -> the current arm, odd -> the previous one.
    const original = globalThis.crypto.getRandomValues;
    try {
      for (const [byte, expected] of [
        [0, "white"],
        [2, "white"],
        [1, "white_prev"],
        [255, "white_prev"],
      ] as const) {
        (globalThis.crypto as { getRandomValues: (a: Uint8Array) => Uint8Array }).getRandomValues =
          (arr: Uint8Array) => {
            arr[0] = byte;
            return arr;
          };
        mockNextOpts.value = null;
        mockCookiesSet.mockClear();
        await proxy(makeNextRequest("http://localhost:3000/"));
        expect(variantHeader()).toBe(expected);
        expect(landingCookieCalls()[0]![1]).toBe(expected);
      }
    } finally {
      (globalThis.crypto as { getRandomValues: typeof original }).getRandomValues = original;
    }
  });

  it("honours a ?variant= override and makes it stick", async () => {
    await proxy(makeNextRequest("http://localhost:3000/?variant=white_prev"));
    expect(variantHeader()).toBe("white_prev");
    const calls = landingCookieCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe("white_prev");
  });

  it("ignores an unknown ?variant= value", async () => {
    await proxy(makeNextRequest("http://localhost:3000/?variant=purple"));
    expect(["white", "white_prev"]).toContain(variantHeader());
  });

  it("keeps an existing arm cookie and does not re-set it", async () => {
    for (const arm of ["white", "white_prev"]) {
      mockNextOpts.value = null;
      mockCookiesSet.mockClear();
      await proxy(
        makeNextRequest("http://localhost:3000/", undefined, undefined, undefined, undefined, arm)
      );
      expect(variantHeader()).toBe(arm);
      expect(landingCookieCalls()).toHaveLength(0);
    }
  });

  it("re-assigns a visitor still carrying the retired control cookie", async () => {
    await proxy(
      makeNextRequest(
        "http://localhost:3000/",
        undefined,
        undefined,
        undefined,
        undefined,
        "control"
      )
    );
    // The dark landing no longer exists, so "control" cannot be served: the
    // visitor joins one of the two live arms and the cookie is re-stamped.
    expect(["white", "white_prev"]).toContain(variantHeader());
    const calls = landingCookieCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe(variantHeader());
  });

  it("serves the current arm to crawlers and never sets a cookie (one indexed page)", async () => {
    await proxy(
      makeNextRequest(
        "http://localhost:3000/",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
      )
    );
    // Bots are pinned to "white" so `/` has one canonical rendering in the index,
    // and they are still never given a cookie.
    expect(variantHeader()).toBe("white");
    expect(landingCookieCalls()).toHaveLength(0);
  });

  it("does not touch the landing cookie or header on non-landing routes", async () => {
    await proxy(makeNextRequest("http://localhost:3000/about"));
    expect(variantHeader()).toBeFalsy();
    expect(landingCookieCalls()).toHaveLength(0);
  });
});

describe("proxy — consent-independent daily unique-visit count", () => {
  beforeEach(() => {
    mockResponseHeaders.clear();
    mockNextOpts.value = null;
    mockCookiesSet.mockClear();
    delete process.env.STAGING_PASSWORD;
  });

  function makeVisitRequest(
    opts: {
      path?: string;
      method?: string;
      dest?: string | null;
      accept?: string;
      ua?: string;
      secPurpose?: string;
      liqDv?: string;
    } = {}
  ) {
    const url = `http://localhost:3000${opts.path ?? "/"}`;
    const headers = new Headers();
    headers.set("user-agent", opts.ua ?? "TestAgent/1.0");
    if (opts.dest !== null) headers.set("sec-fetch-dest", opts.dest ?? "document");
    if (opts.accept) headers.set("accept", opts.accept);
    if (opts.secPurpose) headers.set("sec-purpose", opts.secPurpose);
    return {
      method: opts.method ?? "GET",
      headers,
      url,
      cookies: {
        get: (n: string) => (n === "liq_dv" && opts.liqDv ? { value: opts.liqDv } : undefined),
      },
      nextUrl: {
        pathname: new URL(url).pathname,
        search: "",
        searchParams: new URL(url).searchParams,
      },
    } as never;
  }

  it("counts a fresh document GET on a public page", () => {
    expect(shouldCountVisit(makeVisitRequest({ dest: "document" }))).toBe(true);
  });

  it("falls back to Accept: text/html when sec-fetch-dest is absent", () => {
    expect(
      shouldCountVisit(makeVisitRequest({ dest: null, accept: "text/html,application/xhtml+xml" }))
    ).toBe(true);
  });

  it("ignores non-GET / api / admin / login / _next / bots / prefetch / non-document", () => {
    expect(shouldCountVisit(makeVisitRequest({ method: "POST" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ path: "/api/contact" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ path: "/admin/x" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ path: "/login" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ path: "/_next/data/x.json" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ ua: "Googlebot/2.1" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ secPurpose: "prefetch" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ dest: "image" }))).toBe(false);
    expect(shouldCountVisit(makeVisitRequest({ dest: null, accept: "application/json" }))).toBe(
      false
    );
  });

  it("flags x-liq-new-visit (with the arm) + sets the liq_dv cookie on a fresh daily document visit", async () => {
    await proxy(makeVisitRequest({ dest: "document" }));
    // A/B concluded → the landing arm is always "white" on "/".
    expect(mockNextOpts.value?.request?.headers?.get("x-liq-new-visit")).toBe("white");
    const dvCall = mockCookiesSet.mock.calls.find((c) => c[0] === "liq_dv");
    expect(dvCall).toBeDefined();
    expect(dvCall![2]).toEqual(
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
    );
  });

  it("carries the white arm in x-liq-new-visit when ?variant=white", async () => {
    await proxy(makeVisitRequest({ path: "/?variant=white", dest: "document" }));
    expect(mockNextOpts.value?.request?.headers?.get("x-liq-new-visit")).toBe("white");
  });

  it("does NOT flag/set when liq_dv already equals today (deduped)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await proxy(makeVisitRequest({ dest: "document", liqDv: today }));
    expect(mockNextOpts.value?.request?.headers?.get("x-liq-new-visit")).toBeFalsy();
    expect(mockCookiesSet.mock.calls.find((c) => c[0] === "liq_dv")).toBeUndefined();
  });
});
