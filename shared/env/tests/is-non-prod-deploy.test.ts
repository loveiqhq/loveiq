import { afterEach, describe, expect, it, vi } from "vitest";

import { isNonProdDeploy, isProductionSite } from "@shared/env/is-non-prod-deploy";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * This gates things that protect the product — today, whether report text can be
 * copied. Every case below is written from the same angle: an environment we do
 * not positively recognise must come out as PRODUCTION, because the failure that
 * matters is relaxing a protection in front of customers, not being strict on a
 * preview.
 */
describe("isNonProdDeploy", () => {
  it("is false on the live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of [
      "https://www.loveiq.org",
      "https://loveiq.org",
      "https://www.loveiq.org/",
      "HTTPS://WWW.LOVEIQ.ORG",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
      expect(isNonProdDeploy(), url).toBe(false);
    }
  });

  it("is true on staging and on Vercel previews", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of [
      "https://staging.loveiq.org",
      "https://loveiq-abc123-loveiq.vercel.app",
      "https://loveiq-web-git-staging-loveiq.vercel.app",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
      expect(isNonProdDeploy(), url).toBe(true);
    }
  });

  it("is true in local dev regardless of the site URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(isNonProdDeploy()).toBe(true);
  });

  it("treats an unknown or missing site URL as PRODUCTION", () => {
    // The load-bearing case. A misconfigured or renamed environment must not
    // silently unlock the report's text.
    vi.stubEnv("NODE_ENV", "production");
    for (const url of [
      "",
      "   ",
      "not-a-url",
      "https://example.com",
      "https://loveiq.org.evil.com",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
      expect(isNonProdDeploy(), JSON.stringify(url)).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(isNonProdDeploy()).toBe(false);
  });
});

/**
 * This one gates third-party analytics, and it fails the OTHER way on purpose: an
 * environment we do not positively recognise must come out as NOT production,
 * because the failure that matters here is mixing a developer's or a tester's
 * traffic into the numbers marketing reports on — and, via GA4 purchases, into the
 * conversion signal Google Ads bids on.
 */
describe("isProductionSite", () => {
  it("is true only on the live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of [
      "https://www.loveiq.org",
      "https://loveiq.org",
      "https://www.loveiq.org/",
      "HTTPS://WWW.LOVEIQ.ORG",
      "https://www.loveiq.org/report/abc",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
      expect(isProductionSite(), url).toBe(true);
    }
  });

  it("is false on staging, previews, dev and anything unrecognised", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const url of [
      "https://staging.loveiq.org",
      "https://loveiq-abc123-loveiq.vercel.app",
      "https://loveiq-web-git-staging-loveiq.vercel.app",
      "",
      "   ",
      "not-a-url",
      "https://example.com",
      // Suffix attack: must not pass on a "contains loveiq.org" test.
      "https://www.loveiq.org.evil.com",
      // A production HOST over plain http is not the live site.
      "http://www.loveiq.org",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", url);
      expect(isProductionSite(), JSON.stringify(url)).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(isProductionSite()).toBe(false);
  });

  it("is false in local dev even when the site URL says production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(isProductionSite()).toBe(false);
  });

  /**
   * The reason this is a separate function rather than `!isNonProdDeploy()`.
   *
   * `npm run build && npm start` on a laptop: NODE_ENV=production with a localhost
   * site URL. That is neither "staging." nor ".vercel.app", so the copy-protection
   * gate correctly reads it as production (fail closed on protection) — and an
   * analytics gate written as its inverse would have loaded the real GA4 and the
   * real Google Ads tag on a developer's machine. Both gates return the SAME value
   * here, which is only correct because they mean opposite things.
   */
  it("does not treat a local production build as the live site", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    expect(isProductionSite()).toBe(false);
    // Deliberately NOT the inverse — both false, for opposite reasons.
    expect(isNonProdDeploy()).toBe(false);
  });
});
