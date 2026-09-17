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
    // The live site is a Vercel production deployment. A production-looking URL is no
    // longer enough on its own — see "an absent environment" below for why.
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
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

  /**
   * THE CASE THE TEST ABOVE DOES NOT COVER, and the one that actually bit.
   *
   * The test above uses a LOCALHOST site url. CI builds bake the PRODUCTION one — so the
   * host allowlist matches, `NEXT_PUBLIC_VERCEL_ENV` is absent off Vercel, and the gate
   * says "live site" for a bundle that is then served on localhost. Measured in Microsoft
   * Clarity on 2026-09-17: 177 of 711 sessions over three days were `localhost:3000`, each
   * one a fresh browser profile viewing a single page for ten seconds — an automated run,
   * recording into the project real customers are recorded in.
   *
   * GA4 WAS AFFECTED TOO, and an earlier version of this comment said it was not.
   * Reasoning from the layout's own note — the analytics library loads only after consent,
   * and CI never consents — gave a confident wrong answer. Measured instead, once the
   * Google credential was working again: 587 `localhost` sessions in GA4 over fourteen
   * days against 3,401 real ones, about 15% of the property. Consent defaults vary by
   * region and a US-hosted runner is not the same as a refusing browser.
   *
   * The same measurement shows this fix closing it. On 2026-09-17 localhost sessions ran
   * at 13:00, 14:00 and 15:00 and then stopped entirely, while production traffic carried
   * on at 161, 66, 96, 59 and 46 an hour — and the corrected gate went live at 14:31.
   */
  it("is false for a CI build that bakes the production URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");

    // Was TRUE until 2026-09-17, which is how CI ended up in the customer analytics.
    expect(isProductionSite()).toBe(false);
    // The other gate is unchanged: it protects rather than publishes, so an unknown
    // environment must still read as production and keep the protection ON.
    expect(isNonProdDeploy()).toBe(false);
  });

  it("falls back to the runtime environment when the build-time one is missing", () => {
    /**
     * The safety net that makes demanding an environment affordable. The build-time
     * variable exists only while Vercel's "expose system environment variables" setting is
     * on; the runtime one is always there. Without this, turning that setting off would
     * silently stop client analytics, server-side GA4 purchase events and PostHog server
     * events all at once — far worse than the pollution the change was made to stop.
     */
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");

    expect(isProductionSite()).toBe(true);
  });

  it("is false once that build declares a non-production environment", () => {
    /**
     * The fix, using the mechanism already here rather than a new flag: a CI workflow that
     * serves the build sets `NEXT_PUBLIC_VERCEL_ENV` to anything that is not "production",
     * and the existing environment check refuses it. The production URL is kept, so
     * canonical tags and OG images still resemble the live site for auditing.
     */
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");

    for (const env of ["ci", "preview", "development"]) {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env);
      expect(isProductionSite(), env).toBe(false);
    }
  });
});

/**
 * THE HOLE THESE CLOSE, measured on production 2026-09-14.
 *
 * `NEXT_PUBLIC_SITE_URL` is ONE value shared by this project's Production, Preview and
 * Development environments — `https://www.loveiq.org`. So every preview deployment
 * satisfied the production host allowlist and identified as the live site: a preview
 * served the identical GA4 / GTM / Clarity tags as production, ran the Google Ads
 * conversion path, and stamped `deploy_env: "production"` on its PostHog events. Nothing
 * downstream could tell that traffic apart afterwards, because it was labelled as real.
 *
 * Both gates now also consult the environment Vercel built the deployment FOR, which it
 * stamps per deployment. Verified rather than assumed: /api/build-info reports VERCEL_ENV
 * "production" on www.loveiq.org and "preview" on a preview deployment.
 */
describe("the Vercel environment overrides a production-looking site URL", () => {
  /** The exact production configuration of a preview deployment, before this fix. */
  const asPreviewDeployment = () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
  };

  it("does not treat a preview deployment as the live site", () => {
    asPreviewDeployment();
    expect(isProductionSite()).toBe(false);
  });

  it("treats a preview deployment as non-production", () => {
    asPreviewDeployment();
    expect(isNonProdDeploy()).toBe(true);
  });

  it("does the same for a development deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "development");
    expect(isProductionSite()).toBe(false);
    expect(isNonProdDeploy()).toBe(true);
  });

  /**
   * THE HALF THAT MUST NOT REGRESS. On the real production deployment Vercel stamps
   * "production", and everything has to behave exactly as it did before this change —
   * otherwise the fix silently turns off analytics on the live site, which is a far worse
   * outcome than the pollution it set out to prevent.
   */
  it("leaves the real production deployment completely unchanged", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    expect(isProductionSite()).toBe(true);
    expect(isNonProdDeploy()).toBe(false);
  });

  /**
   * AN ABSENT ENVIRONMENT MAKES THE TWO GATES DIVERGE, which is the whole reason they are
   * separate functions rather than one and its negation.
   *
   * `isNonProdDeploy()` RELAXES a protection, so an unknown environment has to read as
   * production and keep the protection on. `isProductionSite()` PUBLISHES — analytics
   * tags, GA4 purchase events, PostHog — so an unknown environment has to read as "not the
   * live site" and send nothing. Both used to answer this case the same way, and that
   * agreement was the defect: it is what let a CI build publish into customer analytics.
   */
  it("makes the two gates disagree when the environment is absent, on purpose", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("VERCEL_ENV", "");

    // Publishes nothing without being told it is production.
    expect(isProductionSite()).toBe(false);
    // Still protects, because it cannot prove it is NOT production.
    expect(isNonProdDeploy()).toBe(false);
  });

  /** Casing and stray whitespace must not turn production into a preview. */
  it("is not fooled by casing or whitespace on the production value", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    for (const value of ["Production", "PRODUCTION", " production "]) {
      vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", value);
      expect(isProductionSite(), value).toBe(true);
      expect(isNonProdDeploy(), value).toBe(false);
    }
  });

  /**
   * An unrecognised value is not production. This gate decides whether real customer
   * analytics are sent, so an environment nobody has heard of must fail closed.
   */
  it("treats an unrecognised environment as not production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "some-future-environment");
    expect(isProductionSite()).toBe(false);
  });
});
