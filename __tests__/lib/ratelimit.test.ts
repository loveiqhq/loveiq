import { describe, it, expect, vi } from "vitest";

// Mock @upstash/redis so the module can be imported without the package installed
vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {},
}));

import { getClientIp } from "@shared/http/ratelimit";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    headers: new Headers(headers),
  });
}

describe("getClientIp", () => {
  it("returns x-real-ip when present", () => {
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const req = makeRequest({
      "x-real-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2, 3.3.3.3",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  // X-Forwarded-For is intentionally ignored — it is attacker-controlled and
  // would allow rate-limit key spoofing. Only x-real-ip is trusted (set by Vercel).
  it("ignores x-forwarded-for when x-real-ip is absent", () => {
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("ignores x-forwarded-for with a single IP", () => {
    const req = makeRequest({ "x-forwarded-for": "192.168.1.1" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("ignores x-forwarded-for with IPv6", () => {
    const req = makeRequest({ "x-forwarded-for": "2001:db8::1" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = makeRequest();
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' when x-forwarded-for has invalid IP (also ignored)", () => {
    const req = makeRequest({ "x-forwarded-for": "not-an-ip" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' when x-forwarded-for has IP with octets > 255 (also ignored)", () => {
    const req = makeRequest({ "x-forwarded-for": "999.999.999.999" });
    expect(getClientIp(req)).toBe("unknown");
  });
});
