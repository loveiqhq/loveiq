import { describe, it, expect, beforeAll } from "vitest";
import {
  signImagePayload,
  verifyImagePayload,
  getDigestSigningSecret,
} from "@shared/url/signed-image-url";

const SECRET = "test-secret-needs-at-least-sixteen-chars-of-entropy";

beforeAll(() => {
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = SECRET;
});

describe("signImagePayload + verifyImagePayload", () => {
  it("round-trips a simple object", async () => {
    const payload = { kind: "wizard", slide1: 100, slide2: 80, slide3: 70 };
    const { d, s } = await signImagePayload(payload, SECRET);
    const out = await verifyImagePayload<typeof payload>(d, s, SECRET);
    expect(out).toEqual(payload);
  });

  it("round-trips arrays + nested objects", async () => {
    const payload = {
      sparklines: [
        { day: "2026-05-01", n: 5 },
        { day: "2026-05-02", n: 8 },
      ],
      meta: { week: "2026-W21" },
    };
    const { d, s } = await signImagePayload(payload, SECRET);
    const out = await verifyImagePayload<typeof payload>(d, s, SECRET);
    expect(out).toEqual(payload);
  });

  it("returns null when signature is tampered", async () => {
    const { d, s } = await signImagePayload({ x: 1 }, SECRET);
    const tampered = s.slice(0, -1) + (s.endsWith("A") ? "B" : "A");
    const out = await verifyImagePayload(d, tampered, SECRET);
    expect(out).toBeNull();
  });

  it("returns null when payload is tampered", async () => {
    const { d, s } = await signImagePayload({ x: 1 }, SECRET);
    // Flip the last char of the data so the signature no longer verifies.
    const tampered = d.slice(0, -1) + (d.endsWith("A") ? "B" : "A");
    const out = await verifyImagePayload(tampered, s, SECRET);
    expect(out).toBeNull();
  });

  it("returns null when secret is different (cross-secret forgery defense)", async () => {
    const { d, s } = await signImagePayload({ x: 1 }, SECRET);
    const out = await verifyImagePayload(d, s, "totally-different-secret-1234567890");
    expect(out).toBeNull();
  });

  it("returns null for null/undefined/empty inputs", async () => {
    expect(await verifyImagePayload(null, null, SECRET)).toBeNull();
    expect(await verifyImagePayload("", "", SECRET)).toBeNull();
    expect(await verifyImagePayload("abc", null, SECRET)).toBeNull();
    expect(await verifyImagePayload(null, "abc", SECRET)).toBeNull();
  });

  it("returns null for non-base64url chars (injection defense)", async () => {
    // valid signature but data has a non-alphabet char
    const { s } = await signImagePayload({ x: 1 }, SECRET);
    expect(await verifyImagePayload("not!base64", s, SECRET)).toBeNull();
    expect(await verifyImagePayload("validbase64", "has spaces", SECRET)).toBeNull();
  });

  it("d/s strings are URL-safe (no +, /, =)", async () => {
    const { d, s } = await signImagePayload({ kind: "test", text: "abc/def+ghi=jkl" }, SECRET);
    expect(d).not.toMatch(/[+/=]/);
    expect(s).not.toMatch(/[+/=]/);
  });

  it("produces deterministic output for same payload+secret", async () => {
    const payload = { foo: "bar", n: 42 };
    const a = await signImagePayload(payload, SECRET);
    const b = await signImagePayload(payload, SECRET);
    // JSON.stringify ordering of keys is insertion-deterministic, so same input → same output
    expect(a.d).toBe(b.d);
    expect(a.s).toBe(b.s);
  });
});

describe("getDigestSigningSecret", () => {
  it("prefers STRATEGY_DIGEST_SIGNING_SECRET when set and long enough", () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "primary-secret-with-enough-length-1234";
    process.env.SHARE_VERIFY_SECRET = "share-fallback-secret-1234567890";
    expect(getDigestSigningSecret()).toBe("primary-secret-with-enough-length-1234");
  });

  it("falls back to SHARE_VERIFY_SECRET when primary is missing", () => {
    delete process.env.STRATEGY_DIGEST_SIGNING_SECRET;
    process.env.SHARE_VERIFY_SECRET = "share-fallback-secret-1234567890";
    expect(getDigestSigningSecret()).toContain("share-fallback-secret-1234567890");
  });

  it("falls back to SUPABASE_SERVICE_ROLE_KEY when both above are missing", () => {
    delete process.env.STRATEGY_DIGEST_SIGNING_SECRET;
    delete process.env.SHARE_VERIFY_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-fallback-secret-1234567890";
    expect(getDigestSigningSecret()).toContain("srk-fallback-secret-1234567890");
  });

  it("throws when all three are missing or too short", () => {
    delete process.env.STRATEGY_DIGEST_SIGNING_SECRET;
    delete process.env.SHARE_VERIFY_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getDigestSigningSecret()).toThrow("digest_signing_secret_missing");
  });

  it("rejects too-short secrets (< 16 chars)", () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "short";
    process.env.SHARE_VERIFY_SECRET = "alsoshort";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-fallback-secret-1234567890";
    // Both too short → falls through to SRK
    expect(getDigestSigningSecret()).toContain("srk-fallback-secret-1234567890");
  });
});
