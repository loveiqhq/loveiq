import { afterEach, describe, expect, it, vi } from "vitest";

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

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
