import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

const NOINDEX = /robots:\s*\{[^}]*index:\s*false/;
const read = (route: string) =>
  readFileSync(path.join(process.cwd(), "app", route, "page.tsx"), "utf8");

// Indexable on purpose. These carry original text, people search for them by
// name, and a reachable privacy policy / terms set is a trust signal for a site
// that takes payments. They were noindex until 2026-08-18, which also put them
// in conflict with their own self-referencing canonical tag and showed up in
// Search Console as "Excluded by 'noindex' tag".
const LEGAL_ROUTES = [
  "privacy-policy",
  "terms-of-use",
  "terms-and-conditions",
  "digital-content-terms",
  "medical-disclaimer",
  "cookies",
  "imprint",
];

// Must stay out of the index: per-user, transactional or operator-only.
const PRIVATE_ROUTES = [
  "report",
  "report/[token]",
  "checkout",
  "checkout/return",
  "login",
  "admin/login",
  "admin/submissions",
];

describe("legal pages are indexable", () => {
  it.each(LEGAL_ROUTES)("/%s does not set noindex", (route) => {
    expect(read(route)).not.toMatch(NOINDEX);
  });

  it.each(LEGAL_ROUTES)("/%s declares a self-referencing canonical", (route) => {
    expect(read(route)).toMatch(new RegExp(`canonical:\\s*\`\\$\\{siteUrl\\}/${route}\``));
  });

  it("lists every legal page in the sitemap", () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    for (const route of LEGAL_ROUTES) expect(urls).toContain(`/${route}`);
  });
});

describe("private pages stay out of the index", () => {
  it.each(PRIVATE_ROUTES)("/%s sets noindex", (route) => {
    expect(read(route)).toMatch(NOINDEX);
  });

  it("keeps per-user and transactional routes out of the sitemap", () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    for (const route of ["/report", "/survey", "/checkout", "/login", "/admin"]) {
      expect(urls).not.toContain(route);
    }
  });
});
