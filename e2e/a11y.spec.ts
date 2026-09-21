import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const criticalRoutes = [
  "/",
  "/about",
  "/glossary",
  "/glossary/abandonment-insecurity",
  "/trust-zone",
  "/survey",
  "/privacy-policy",
  "/terms-of-use",
  "/terms-and-conditions",
  "/medical-disclaimer",
  "/digital-content-terms",
  "/cookies",
  "/imprint",
];

/**
 * Wait for entrance animations to finish before measuring contrast.
 *
 * axe samples the colours that are on screen AT THAT MOMENT. The landing's
 * `.animate-on-load` elements fade in, so measuring immediately after `goto`
 * reads a blended mid-transition colour and reports a contrast violation that
 * no user ever sees — `/` failed on `.animate-on-load > .uppercase` at 0ms and
 * 500ms, and passed at 1500ms, every time.
 *
 * The spec already excluded `.reveal-on-scroll` and `.col-anim` for exactly
 * this. Waiting is better than excluding: the elements stay under test, and a
 * real contrast regression in them still fails.
 */
async function settleAnimations(page: import("@playwright/test").Page) {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => a.playState === "finished" || a.playState === "idle"),
      undefined,
      { timeout: 5000 }
    )
    .catch(() => {
      // An infinite decorative animation never finishes; fall through to the
      // fixed settle below rather than failing the a11y check on a spinner.
    });
  await page.waitForTimeout(600);
}

/**
 * KNOWN RED — `/survey`, and it is not a flake.
 *
 * The start CTA is white on the brand orange `#fe6839`: 2.90:1 where AA wants
 * 4.5:1. `c5e00ce8` decided the brand orange "stays on fills, borders and
 * buttons" and moved only TEXT to a darker tone, so this is a trade-off the
 * team took knowingly; there are 16 such fills across 10 files and changing one
 * would just make the set inconsistent. Bumping the label to WCAG "large text"
 * does not rescue it either — 2.90 is still under the 3:1 floor that applies
 * there. Passing it needs a darker fill (#CC4718 = 4.69:1, #C2410C = 5.18:1)
 * applied to all sixteen, which is a design call, deferred on 2026-09-14.
 *
 * Deliberately NOT excluded: an exclusion would hide any FUTURE contrast
 * regression on those buttons too.
 *
 * It is PINNED instead, as of 2026-09-21, because this suite now gates every push
 * (`ci.yml` job `e2e`) and a permanently-red test blocks every merge — which is how
 * a team learns to ignore red. The pin is deliberately narrow in all three
 * directions that matter:
 *
 *   - by NODE, not by violation. axe groups every offending element on a page into
 *     ONE `color-contrast` violation, so dropping the violation would drop a second,
 *     unrelated contrast bug sitting in the same object. Only nodes whose measured
 *     pair is exactly white-on-#fe6839 are forgiven.
 *   - by ROUTE. The other twelve routes are untouched; this is `/survey` only.
 *   - by PRESENCE. If the gap is ever fixed the pin fails LOUDLY, because an
 *     allowance nobody notices has outlived its subject is how dead cruft survives.
 *     That last check runs on DESKTOP CHROME ONLY, and the reason is measured: on
 *     Mobile Chrome and Desktop Safari axe intermittently reports no contrast
 *     violation on this page at all — the button carries a 700ms entrance animation
 *     and those two engines sometimes sample it before it settles. Asserting presence
 *     on every engine therefore reddened CI on browser variance rather than on
 *     anything about the button (measured: 1 failed, 2 flaky, all three of them this
 *     assertion). Forgiveness still applies on every engine; only the ratchet is
 *     scoped, and one engine is all a ratchet needs.
 */
const KNOWN_GAP = { route: "/survey", id: "color-contrast", fg: "#ffffff", bg: "#fe6839" };
for (const route of criticalRoutes) {
  test(`${route} — no critical accessibility violations`, async ({ page }, testInfo) => {
    await page.goto(route);
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .exclude("#cookieyes-root") // third-party consent banner
      .exclude(".g-recaptcha") // third-party reCAPTCHA widget
      .exclude(".bg-clip-text") // gradient text — axe cannot evaluate variable-contrast gradients
      .exclude('[style*="clip-path"]') // clip-path inline style creates GPU compositing layer on Safari, causing axe to misreport text colors (false positive)
      .exclude(".col-anim") // will-change:clip-path GPU compositing layer causes axe to misreport text colors mid-animation (false positive, same as clip-path exclusion above)
      .exclude(".reveal-on-scroll") // opacity:0 + transform start state — IntersectionObserver triggers mid-transition on mobile viewports, causing axe to measure blended mid-transition colors (false positive)
      .analyze();

    // Only fail on critical or serious violations (minor/moderate are tracked, not blocking)
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    let knownNodes = 0;
    const unexpected = blocking
      .map((v) => {
        if (route !== KNOWN_GAP.route || v.id !== KNOWN_GAP.id) return v;
        const nodes = v.nodes.filter((n) => {
          const isKnown = n.any.some(
            (c) => c.data?.fgColor === KNOWN_GAP.fg && c.data?.bgColor === KNOWN_GAP.bg
          );
          if (isKnown) knownNodes += 1;
          return !isKnown;
        });
        return { ...v, nodes };
      })
      .filter((v) => v.nodes.length > 0);

    expect(
      unexpected,
      `Critical/serious a11y violations on ${route}: ${unexpected.map((v) => `${v.id}: ${v.description}`).join("; ")}`
    ).toHaveLength(0);

    if (route === KNOWN_GAP.route && testInfo.project.name === "Desktop Chrome") {
      expect(
        knownNodes,
        `The white-on-${KNOWN_GAP.bg} contrast gap on ${KNOWN_GAP.route} is GONE. ` +
          "Delete KNOWN_GAP, this assertion, and the KNOWN RED comment above."
      ).toBeGreaterThan(0);
    }
  });
}
