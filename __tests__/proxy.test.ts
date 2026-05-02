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
vi.mock("../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock next/server
const { mockCookiesSet, mockRedirect, mockResponseHeaders } = vi.hoisted(() => ({
  mockResponseHeaders: new Map<string, string>(),
  mockCookiesSet: vi.fn(),
  mockRedirect: vi.fn((url: URL) => ({ redirectedTo: url.toString() })),
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
        },
      })),
      redirect: mockRedirect,
    },
  };
});

import { proxy } from "../proxy";
import logger from "../lib/logger";

function makeNextRequest(url = "http://localhost:3000/", cookieValue?: string) {
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
    mockRedirect.mockClear();
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

  it("sets Strict-Transport-Security", () => {
    proxy(makeNextRequest());
    const hsts = mockResponseHeaders.get("Strict-Transport-Security");
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
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
    proxy(makeNextRequest("http://localhost:3000/", "existing-token"));
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it("logs API requests via logger", () => {
    proxy(makeNextRequest("http://localhost:3000/api/waitlist"));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "api_request",
        path: "/api/waitlist",
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
});
