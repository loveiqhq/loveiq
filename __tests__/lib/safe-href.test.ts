import { describe, expect, it } from "vitest";
import { safeHref } from "@shared/url/safe-href";

// React does not block `javascript:` URLs in href — `safeHref` is the
// gate that prevents admin-vs-admin XSS via stored URL fields. Every
// rejection here is an attack we intend to block.
describe("safeHref", () => {
  it("accepts http/https/mailto/tel", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("HTTP://example.com")).toBe("HTTP://example.com");
    expect(safeHref("mailto:hello@loveiq.org")).toBe("mailto:hello@loveiq.org");
    expect(safeHref("tel:+1234")).toBe("tel:+1234");
  });

  it("accepts relative paths starting with /", () => {
    expect(safeHref("/admin/research")).toBe("/admin/research");
    expect(safeHref("/foo?bar=1")).toBe("/foo?bar=1");
  });

  it("accepts in-page anchors", () => {
    expect(safeHref("#section")).toBe("#section");
  });

  it("rejects javascript: schemes (the actual attack)", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHref(" javascript:alert(1) ")).toBeNull();
    // Tab/newline obfuscation
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
  });

  it("rejects data: URIs", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript: schemes (legacy IE)", () => {
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeHref("//evil.com")).toBeNull();
  });

  it("rejects null/empty/whitespace", () => {
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
  });
});
