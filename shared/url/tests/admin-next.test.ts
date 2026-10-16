import { describe, expect, it } from "vitest";

import { ADMIN_HOME, safeAdminNext } from "@shared/url/admin-next";

describe("safeAdminNext: where a sign-in may send the admin back to", () => {
  it.each([
    "/admin/ap",
    "/admin/ap/assessment-a?period=custom&from=2026-10-01&to=2026-10-07",
    "/admin/ap/assessment-a/payment?period=7d&device=phone",
    "/admin/ap/assessment-a/landing#assessment-page",
    "/admin/ap/sources?source=posthog",
  ])("lets an admin page through: %s", (next) => {
    expect(safeAdminNext(next)).toBe(next);
  });

  it.each([
    // Off the site: protocol-relative, a backslash browsers read as a slash, a scheme.
    "//evil.com",
    "//evil.com/admin/ap",
    "/\\evil.com",
    "/admin/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "https://evil.com/admin/ap",
    "javascript:alert(1)",
    "/admin/https://evil.com",
    // Out of the admin, through a ".." or a doubled slash.
    "/admin/..//evil",
    "/admin/../ap",
    "/admin/ap/..",
    "/admin//evil.com",
    "/admin/ap?next=//evil.com",
    // Encoded, in any case and any depth: no "%" passes at all.
    "%2F%2Fevil.com",
    "/admin/%2F%2Fevil.com",
    "/admin/%2f%2fevil.com",
    "/admin/%5Cevil.com",
    "/admin/%252F%252Fevil.com",
    "/admin/ap%0d%0aSet-Cookie:x=1",
    // User-info and lookalikes.
    "/admin@evil.com",
    "/admin/@evil.com",
    "/administrator",
    "/admin",
    "/admin/ap∕evil.com",
    // Whitespace and control characters.
    " /admin/ap",
    "/admin/ap\n",
    "/admin/\tap",
    "",
    "x".repeat(2000),
  ])("refuses %j", (next) => {
    expect(safeAdminNext(next)).toBeNull();
  });

  it("refuses anything that is not text", () => {
    for (const next of [null, undefined, 42, ["/admin/ap"], { next: "/admin/ap" }])
      expect(safeAdminNext(next)).toBeNull();
  });

  it("falls back to the dashboard", () => {
    expect(ADMIN_HOME).toBe("/admin/ap");
  });
});
