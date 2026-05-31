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

  // R-08: IPv6 /64 collapse. The key property is that two addresses in the SAME
  // /64 produce the SAME bucket key (so rotating low-order bits can't evade the
  // limit), while different /64s stay distinct.
  const ipv6Key = (ip: string) => getClientIp(makeRequest({ "x-real-ip": ip }));

  it("collapses compressed IPv6 addresses in the same /64 to one key", () => {
    // Both are 2001:db8:0:0:*  → same /64. The old slice(0,4) bug gave them
    // different keys because `::` shifts the colon-group positions.
    expect(ipv6Key("2001:db8::dead:beef")).toBe(ipv6Key("2001:db8::cafe:1"));
  });

  it("collapses full and compressed forms of the same /64 to the same key", () => {
    expect(ipv6Key("2001:db8:0:0:0:0:dead:beef")).toBe(ipv6Key("2001:db8::1"));
  });

  it("keeps different /64s in different buckets", () => {
    expect(ipv6Key("2001:db8:1::1")).not.toBe(ipv6Key("2001:db8:2::1"));
  });

  it("produces a canonical /64 key", () => {
    expect(ipv6Key("2001:db8::dead:beef")).toBe("2001:db8:0:0::/64");
  });

  it("buckets IPv4-mapped IPv6 on the embedded dotted-quad (not all into one key)", () => {
    expect(ipv6Key("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(ipv6Key("::ffff:203.0.113.5")).not.toBe(ipv6Key("::ffff:198.51.100.7"));
  });

  it("leaves IPv4 addresses keyed on the full /32", () => {
    expect(ipv6Key("203.0.113.5")).toBe("203.0.113.5");
  });
});
