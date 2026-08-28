import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the environment separation marketing asked for on 2026-08-27: "separate
 * localhost/staging traffic from production analytics".
 *
 * The problem this locks down is specifically that GA4, Google Ads and Clarity are
 * HARDCODED ids with no per-environment property, so there is no env var anybody
 * could have set to fix it — verified by curl at the time: staging.loveiq.org served
 * `G-QTYY69L46N`, `AW-18068690553` and `/clarity-init.js` byte-identically to
 * www.loveiq.org. The gate is build-time in app/layout.tsx, so the tags are not
 * emitted at all off production.
 *
 * These are source assertions rather than render assertions on purpose: the failure
 * mode is somebody adding a FIFTH tracker next to the four and not wrapping it, and
 * a render test of the current four would pass while that happened. The list of
 * tracker fingerprints below is the thing that has to grow with the file.
 */
const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

/** Every third-party tracker fingerprint that must sit behind the gate. */
const GATED_TRACKERS = [
  ["GA4 loader", "gtag/js?id=G-QTYY69L46N"],
  ["GA4 config", "window.gtag('config', 'G-QTYY69L46N'"],
  // No "Google Ads loader" entry: there is only ONE gtag/js load now. gtag.js is a
  // single library serving every destination, so loading it per-ID fetched ~151 KiB
  // of identical code. Google's own snippet loads it once and calls config() per ID,
  // which is what the next line guards — that config is now the only thing wiring
  // Ads up, so it is the fingerprint that matters.
  ["Google Ads config", "window.gtag('config', 'AW-18068690553')"],
  // `src="..."` and not the bare filename: the JSX comment above the tag also says
  // "public/clarity-init.js", and matching prose would fail the enclosure check on a
  // sentence rather than on a script.
  ["Microsoft Clarity", 'src="/clarity-init.js"'],
  ["Google Tag Manager", "<GtmScript"],
  ["GTM noscript iframe", "<GtmNoScript"],
] as const;

describe("production analytics gate", () => {
  it("derives the gate from the shared production-host allowlist", () => {
    expect(layout).toContain('from "@shared/env/is-non-prod-deploy"');
    expect(layout).toContain("const productionAnalyticsEnabled = isProductionSite();");
    // NOT isNonProdDeploy — that one defaults an unknown environment to
    // "production", which is right for protecting the report and wrong here.
    expect(layout).not.toContain("!isNonProdDeploy()");
  });

  /**
   * Character ranges of the file covered by a `{productionAnalyticsEnabled && ...}`
   * JSX expression, found by matching braces from each gate to its own close.
   *
   * The first version of this test compared `indexOf(fingerprint)` against
   * `indexOf("productionAnalyticsEnabled &&")` — "does the tag appear after the first
   * gate anywhere in the file". Mutation testing killed it: replacing the GA block's
   * own gate with `true &&` left the test passing, because an EARLIER gate (the
   * preconnect block) still satisfied it. A guard around a paid-media tag that passes
   * while the tag is ungated is worse than no guard, so it does the real work now.
   */
  function gatedRanges(source: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const needle = "{productionAnalyticsEnabled &&";
    for (let from = 0; ; ) {
      const open = source.indexOf(needle, from);
      if (open === -1) break;
      let depth = 0;
      let i = open;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      ranges.push([open, i]);
      from = open + needle.length;
    }
    return ranges;
  }

  const GATED_RANGES = gatedRanges(layout);

  describe("every tracker sits inside its OWN gate", () => {
    it("finds a gate at all", () => {
      expect(GATED_RANGES.length).toBeGreaterThan(0);
    });

    it.each(GATED_TRACKERS)("keeps %s behind the gate", (_name, fingerprint) => {
      expect(layout).toContain(fingerprint);
      // EVERY occurrence, not just the first: a second, ungated copy of a tag is
      // exactly how one of these comes back by accident.
      for (
        let at = layout.indexOf(fingerprint);
        at !== -1;
        at = layout.indexOf(fingerprint, at + 1)
      ) {
        const inside = GATED_RANGES.some(([open, close]) => at > open && at < close);
        expect(inside, `${fingerprint} at offset ${at} is not inside a gate`).toBe(true);
      }
    });
  });

  it("leaves CookieYes and PostHog running on every environment", () => {
    // CookieYes must stay: its consent cookie is what gates the FIRST-party
    // durable writes in persistAnalyticsEvent, so dropping it off production
    // would silently stop the funnel tables staging QA reads.
    const cookieYesAt = layout.indexOf("cdn-cookieyes.com");
    expect(cookieYesAt).toBeGreaterThan(-1);
    expect(layout.slice(0, cookieYesAt)).not.toContain("productionAnalyticsEnabled &&");

    // PostHog is labelled, not excluded — it is the only replay/error trail
    // staging and local dev have.
    const client = readFileSync(join(process.cwd(), "instrumentation-client.ts"), "utf8");
    expect(client).toContain("deploy_env");
    expect(client).not.toContain("isProductionSite() &&");
    // Registered inside `loaded`, which runs BEFORE posthog-js captures the
    // session's first $pageview. After init() instead, that one event per session
    // would ship with no environment on it.
    expect(client).toMatch(/loaded:\s*\(ph\)\s*=>\s*ph\.register\(\{\s*deploy_env/);
  });

  /**
   * Moved here from e2e/smoke.spec.ts, where it could only ever see a
   * non-production build — and where the regex behind it contained a raw backspace
   * byte, so it matched nothing and both assertions passed on an empty string. The
   * consent decision is a property of the source, so this is the right layer.
   */
  it("keeps Clarity deliberately un-consent-gated on production", () => {
    // Owner decision 2026-08-10, reversing audit finding H1: Clarity must execute
    // for every visitor, so its tag carries neither type="text/plain" nor
    // data-cookieyes. Those two attributes are the only mechanism measured to
    // actually withhold a tag on this site, so a well-meaning "re-gate it" edit
    // would silently cut recorded sessions to the consent rate. The environment
    // gate around it does not touch that — it only stops non-production builds
    // recording at all.
    const tag = /<script[^>]*clarity-init[^>]*>/i.exec(layout)?.[0] ?? "";
    expect(tag, "clarity script tag not found in app/layout.tsx").not.toBe("");
    expect(tag).not.toContain("text/plain");
    expect(tag).not.toContain("data-cookieyes");
  });

  it("does not ship PostHog bundles for products this project does not use", () => {
    // 26 KiB of surveys.js was downloading on every page load while
    // `surveys_opt_in` and `survey_config` were both null on the project — pure dead
    // weight, and one line to stop. Asserted so it cannot silently come back.
    const client = readFileSync(join(process.cwd(), "instrumentation-client.ts"), "utf8");
    expect(client).toMatch(/disable_surveys:\s*true/);
  });

  it("preconnects to PostHog on EVERY environment, and stays within four hints", () => {
    /**
     * PostHog runs everywhere, so its preconnect must sit OUTSIDE the
     * production-only block — inside it, the 300 ms LCP saving PageSpeed measured
     * would apply only on production, which is the one place it was already fine.
     *
     * The count matters too: preconnect hints past about four cost more in
     * contention than they save, so this fails loudly if a fifth is added rather
     * than letting them accumulate.
     */
    const hints = layout.match(/<link rel="preconnect"/g) ?? [];
    expect(hints.length).toBeLessThanOrEqual(4);

    const at = layout.indexOf('href="https://eu-assets.i.posthog.com"');
    expect(at, "PostHog preconnect missing").toBeGreaterThan(-1);
    const inside = GATED_RANGES.some(([open, close]) => at > open && at < close);
    expect(inside, "PostHog preconnect must not be production-gated").toBe(false);
  });

  it("defines the gtag shim EARLY, so events fired on mount are not lost", () => {
    /**
     * The whole 2026-08-28 fix in one assertion. `ga-init` is deliberately
     * lazyOnload — the 185 KiB library must not block first paint — but the three-line
     * gtag/dataLayer shim has to exist before that, or `gtag()` is undefined for every
     * event fired from a mount effect and the call is lost rather than queued.
     * Measured before the split: price_shown wrote 1,172 rows to our database and
     * reached GA4 four times.
     */
    const shim = layout.indexOf('id="gtag-shim"');
    expect(shim, "gtag shim not found").toBeGreaterThan(-1);

    // It must NOT be lazyOnload — that is the bug it exists to fix.
    const shimBlock = layout.slice(shim, shim + 200);
    expect(shimBlock).toContain('strategy="afterInteractive"');
    expect(shimBlock).not.toContain("lazyOnload");

    // ...and it must come before the heavy loader it queues for.
    expect(shim).toBeLessThan(layout.indexOf("gtag/js?id=G-QTYY69L46N"));

    // The racy window flags must not come back as gates in the client.
    const client = readFileSync(join(process.cwd(), "features/analytics/client.ts"), "utf8");
    expect(client).not.toContain("window.__loveiqAnalyticsEnabled");
    expect(client).not.toContain("window.__loveiqGoogleAdsEnabled");
    expect(client).toContain("if (!isProductionSite()) return;");
  });

  it("loads gtag.js exactly once, not once per destination", () => {
    // It used to load twice — G-QTYY69L46N and AW-18068690553 each had their own
    // loader — for ~151 KiB of byte-identical library. Worth pinning: adding a third
    // destination later makes "one loader per ID" look like the obvious pattern.
    const loaders = layout.match(/gtag\/js\?id=/g) ?? [];
    expect(loaders).toHaveLength(1);
    // ...and both destinations must still be configured off that single load.
    expect(layout).toContain("window.gtag('config', 'G-QTYY69L46N'");
    expect(layout).toContain("window.gtag('config', 'AW-18068690553')");
  });

  it("refuses the server-side GA4 purchase send off production", () => {
    // The one send that survives the client gate: it runs in the Stripe webhook,
    // and staging shares the production database, so a sandbox test purchase would
    // otherwise land in real GA4 as revenue — and in Google Ads as a conversion.
    const ga4 = readFileSync(join(process.cwd(), "features/analytics/server/ga4.ts"), "utf8");
    expect(ga4).toContain("if (!isProductionSite())");
    // The guard has to come before the API-secret check, or "secret set on
    // staging" is once again the only thing standing between a test purchase and
    // the live property.
    expect(ga4.indexOf("if (!isProductionSite())")).toBeLessThan(
      ga4.indexOf("process.env.GA4_API_SECRET")
    );
  });
});
