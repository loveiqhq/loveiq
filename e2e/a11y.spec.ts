import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const criticalRoutes = ["/", "/about", "/waitlist", "/glossary", "/trust-zone", "/survey"];

for (const route of criticalRoutes) {
  test(`${route} — no critical accessibility violations`, async ({ page }) => {
    await page.goto(route);

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
    expect(
      blocking,
      `Critical/serious a11y violations on ${route}: ${blocking.map((v) => `${v.id}: ${v.description}`).join("; ")}`
    ).toHaveLength(0);
  });
}
