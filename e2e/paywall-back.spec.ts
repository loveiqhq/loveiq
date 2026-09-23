import { test, expect, type Page } from "@playwright/test";

import { mockReport } from "./fixtures/report";

/**
 * Back closes the paywall instead of leaving the report.
 *
 * The pricing modal opens on its own as the reader scrolls. On a phone, back is
 * how you dismiss something, and it used to take the reader out of their report
 * to the page behind it — 7 readers in the 30 days to 2026-09-23. See
 * features/report/ui/hooks/useCloseOnBack.ts for the two mechanisms.
 *
 * WHICH "BACK" EACH ENGINE GETS, and why it is not page.goBack() everywhere:
 *
 *  - Chromium (Chrome, Edge, Samsung Internet, and so our Android readers) and
 *    Firefox have CloseWatcher. Android's back gesture reaches the page as a CLOSE REQUEST,
 *    not a history move, and Chromium raises the same close request for
 *    Escape. The modal's own Escape handler would close it first and cancel the
 *    request, so it is kept out of this one: the key reaches only the browser.
 *    page.goBack() here would be a history jump the real back button does not
 *    make — Chrome skips entries a page added before any interaction, which is
 *    exactly the scroll-opened case.
 *  - WebKit has no CloseWatcher. Back there is a history traversal, which
 *    page.goBack() performs faithfully — both Safari projects run that path.
 */

const REPORT = "/report/test-token-back";

async function openReport(
  page: Page,
  options: { query?: string; overrides?: Record<string, unknown> } = {}
) {
  // The dismiss event leaves as a beacon, which neither a route handler nor
  // the request log sees on every engine (WebKit hides both). Record it where
  // it is sent instead.
  await page.addInitScript(() => {
    const w = window as unknown as { __analytics: string[] };
    w.__analytics = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith("/api/analytics-event") && data instanceof Blob) {
        void data.text().then((text) => w.__analytics.push(text));
      }
      return send(url, data);
    };
  });
  await page.route("**/api/analytics-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await mockReport(page, 0, options.overrides);
  // The page behind the report, as /survey is in production.
  await page.goto("/about");
  await page.goto(REPORT + (options.query ?? ""));
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  // Survives only if nothing reloads the page.
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
}

/**
 * The `source` of every paywall_dismissed this page sent, in order.
 *
 * The page persists analytics only with its CSRF cookie, `__Host-csrf`, which
 * must be Secure — and WebKit refuses a Secure cookie on http://localhost, so
 * there it sends nothing to record. Production is https, so that is a property
 * of this test server, not of the fix. The behaviour is asserted everywhere;
 * the source is asserted where it can be sent, Chromium and Firefox. Both take
 * the close-request path; the history path closes through the same unreasoned
 * close, and the modal's dismiss effect cannot tell the two callers apart.
 */
async function expectDismissedAs(page: Page, source: string) {
  const persists = await page.evaluate(() => document.cookie.includes("csrf"));
  if (!persists) return;
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __analytics: string[] }).__analytics
          .map(
            (text) => JSON.parse(text) as { event_type?: string; metadata?: { source?: string } }
          )
          .filter((event) => event.event_type === "paywall_dismissed")
          .map((event) => event.metadata?.source)
      )
    )
    .toEqual([source]);
}

const modal = (page: Page) => page.locator(".report-pricing-modal");

async function pressBack(page: Page) {
  const closeRequest = await page.evaluate(
    () => typeof (window as unknown as { CloseWatcher?: unknown }).CloseWatcher === "function"
  );
  if (closeRequest) {
    await page.evaluate(() =>
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") event.stopImmediatePropagation();
        },
        { capture: true, once: true }
      )
    );
    await page.keyboard.press("Escape");
  } else {
    await page.goBack();
  }
}

async function openFromLockedSection(page: Page) {
  const cta = page.locator(".report-section .report-premium-overlay__cta").first();
  await cta.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await cta.click();
  await expect(modal(page)).toHaveAttribute("data-state", "open");
  return scrollY;
}

async function expectStillOnTheReport(page: Page) {
  await expect(page).toHaveURL(new RegExp(`${REPORT}(\\?[^#]*)?$`));
  expect(
    await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)
  ).toBe(true);
}

test.describe("Back closes the paywall", () => {
  test("back closes the modal and the reader stays where they were", async ({ page }) => {
    await openReport(page);
    const scrollY = await openFromLockedSection(page);

    await pressBack(page);

    await expect(modal(page)).toHaveAttribute("data-state", "closed");
    await expectStillOnTheReport(page);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(scrollY - 4);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scrollY + 4);
    // Measured as its own source, so the number of readers who use back to
    // dismiss is visible rather than folded into another.
    await expectDismissedAs(page, "browser_back");
  });

  test("the next back leaves the report, as it always did", async ({ page }) => {
    await openReport(page);
    await openFromLockedSection(page);
    await pressBack(page);
    await expect(modal(page)).toHaveAttribute("data-state", "closed");

    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("closing with the button leaves no extra step in history", async ({ page }) => {
    await openReport(page);
    await openFromLockedSection(page);

    await page.locator(".report-pricing-modal__close").click();
    await expect(modal(page)).toHaveAttribute("data-state", "closed");
    // Wherever an entry was added, it has been taken back off again.
    await expect
      .poll(() => page.evaluate(() => Boolean(window.history.state?.__loveiqOverlay)))
      .toBe(false);

    await expectDismissedAs(page, "close_button");

    // One press leaves: no dead back press where the modal used to be.
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("Escape still closes it once, as escape", async ({ page }) => {
    await openReport(page);
    await openFromLockedSection(page);

    await page.keyboard.press("Escape");

    await expect(modal(page)).toHaveAttribute("data-state", "closed");
    await expectStillOnTheReport(page);
    await expectDismissedAs(page, "escape");
  });

  test("the modal that opens by itself on scroll closes on back too", async ({ page }) => {
    await openReport(page);
    // Programmatic scroll: no tap, no key, no user activation — the case
    // Chrome's back button would skip a history entry for.
    // Wait for the chapter itself: scrolling before the report has rendered it
    // is a no-op, and the modal then never opens (1 run in 6 on Mobile Safari).
    await page.locator("#attachment_style").waitFor({ state: "attached" });
    await page.evaluate(() => document.getElementById("attachment_style")?.scrollIntoView());
    await expect(modal(page)).toHaveAttribute("data-state", "open", { timeout: 10_000 });

    await pressBack(page);

    await expect(modal(page)).toHaveAttribute("data-state", "closed");
    await expectStillOnTheReport(page);
  });

  test("the offer that opens on arrival closes on back", async ({ page }) => {
    await openReport(page, { query: "?offer=1" });
    await expect(modal(page)).toHaveAttribute("data-state", "open", { timeout: 10_000 });

    await pressBack(page);

    await expect(modal(page)).toHaveAttribute("data-state", "closed");
    await expectStillOnTheReport(page);
  });

  test("a forward press does not bring it back", async ({ page }) => {
    await openReport(page);
    await openFromLockedSection(page);
    await pressBack(page);
    await expect(modal(page)).toHaveAttribute("data-state", "closed");

    await page.goForward();

    await expectStillOnTheReport(page);
    await expect(modal(page)).toHaveAttribute("data-state", "closed");
  });

  test("back closes the share modal too", async ({ page, isMobile }) => {
    test.skip(
      isMobile,
      "On a phone Share lives inside the chapter drawer; the same hook closes the modal, exercised here on the three desktop engines."
    );
    await openReport(page, { overrides: { accessPlan: "full_report" } });
    await page.locator(".report-sidebar__btn", { hasText: "Share" }).click();
    const share = page.locator(".report-share-modal");
    await expect(share).toHaveAttribute("data-state", "open");

    await pressBack(page);

    await expect(share).toHaveAttribute("data-state", "closed");
    await expectStillOnTheReport(page);
  });

  test("checkout still leaves for Stripe with nothing in the way", async ({ page, baseURL }) => {
    await openReport(page);
    const stripe = `${baseURL}/about?stripe=checkout`;
    await page.route("**/api/stripe/checkout-session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true, url: stripe }),
      })
    );
    await openFromLockedSection(page);

    await page.locator(".report-pricing-card__cta", { hasText: "Unlock my report" }).click();
    await expect(page).toHaveURL(stripe);

    // Coming back from Stripe lands on the report again...
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${REPORT}$`));
    // ...and the next back leaves it. On Safari the modal's own entry used to
    // survive underneath Stripe, so this second press reloaded the report
    // instead — the report is served no-store, so nothing restores it.
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
  });
});

/**
 * The chapter menu on phones gets the same treatment, and is the harder case:
 * it hands off inside a single tap. A chapter link closes it and jumps; "Share
 * report" closes it and opens the share modal. On Safari one history entry
 * serves whichever overlay is open (shared/ui/overlay-history.ts), and these
 * pin that neither hand-off costs the reader a back press or undoes a jump.
 */
for (const [arm, query] of [
  ["V1", ""],
  ["2.0", "?v2=1"],
] as const) {
  test.describe(`Back closes the chapter menu (${arm})`, () => {
    test.skip(
      ({ isMobile }) => !isMobile,
      "The chapter menu exists only below the desktop breakpoint."
    );

    const menu = (page: Page) => page.locator("#report-chapter-drawer");
    const openMenu = async (page: Page) => {
      await page.locator(".report-chapter-pill__btn").first().tap();
      await expect(menu(page)).toBeVisible();
    };

    test("back closes the menu and the reader stays where they were", async ({ page }) => {
      await openReport(page, { query });
      const scrollY = await page.evaluate(() => window.scrollY);
      await openMenu(page);

      await pressBack(page);

      await expect(menu(page)).toHaveCount(0);
      await expectStillOnTheReport(page);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollY)).toBeLessThanOrEqual(
        4
      );
    });

    test("a chapter jump still works, back returns from it, and the next back leaves", async ({
      page,
    }) => {
      await openReport(page, { query });
      const before = await page.evaluate(() => window.scrollY);
      await openMenu(page);
      const link = menu(page).locator(".report-chapter-panel__item").nth(4);
      const target = (await link.getAttribute("href"))!.slice(1);
      await link.tap();

      await expect(menu(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`#${target}$`));
      await expect
        .poll(() =>
          page.evaluate((id) => document.getElementById(id)!.getBoundingClientRect().top, target)
        )
        .toBeLessThan(400);

      // Let the smooth scroll finish, as a reader does before pressing back.
      // Pressed mid-animation, Chromium lets the scroll run on and skips the
      // restore — its own behaviour for any smooth fragment jump, on the live
      // report too, not something the menu does.
      await expect
        .poll(async () => {
          const a = await page.evaluate(() => window.scrollY);
          await page.waitForTimeout(200);
          return a === (await page.evaluate(() => window.scrollY));
        })
        .toBe(true);

      // Back undoes the jump, exactly as it did before the menu handled back...
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${REPORT}(\\?[^#]*)?$`));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(before + 4);
      // ...and the next back leaves. A jump stacked on the menu's own entry
      // left a dead press here.
      await page.goBack();
      await expect(page).toHaveURL(/\/about$/);
    });

    test("Share in the menu opens the share modal, and back closes it", async ({ page }) => {
      await openReport(page, { query, overrides: { accessPlan: "full_report" } });
      await openMenu(page);
      await menu(page).locator(".report-sidebar__btn", { hasText: "Share" }).tap();
      const share = page.locator(".report-share-modal");
      // Handed over in one tap: an entry per overlay would have closed this at once.
      await expect(share).toHaveAttribute("data-state", "open");
      await page.waitForTimeout(600);
      await expect(share).toHaveAttribute("data-state", "open");

      await pressBack(page);

      await expect(share).toHaveAttribute("data-state", "closed");
      await expectStillOnTheReport(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/about$/);
    });

    /**
     * Menu -> Share -> close must leave the page scrollable. The V1 menu wrote
     * `body.overflow` itself; the share modal's lock snapshotted that `hidden`
     * and restored it on close, and touch scrolling was dead for the rest of the
     * visit.
     */
    test("sharing from the menu does not leave the page scroll-locked", async ({ page }) => {
      await openReport(page, { query, overrides: { accessPlan: "full_report" } });
      await openMenu(page);
      await menu(page).locator(".report-sidebar__btn", { hasText: "Share" }).tap();
      const share = page.locator(".report-share-modal");
      await expect(share).toHaveAttribute("data-state", "open");
      // Until the menu has finished closing, as it has for any real reader:
      // closed sooner, the menu's own clean-up ran last and hid the strand.
      await expect(menu(page)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(share).toHaveAttribute("data-state", "closed");
      await expect
        .poll(() =>
          page.evaluate(() =>
            [
              document.body.style.overflow,
              document.body.style.position,
              document.documentElement.style.overflow,
            ].join("|")
          )
        )
        .toBe("||");
    });

    test("closing the menu with its button leaves no extra step in history", async ({ page }) => {
      await openReport(page, { query });
      await openMenu(page);
      await menu(page).getByRole("button", { name: "Close chapter menu" }).tap();
      await expect(menu(page)).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => Boolean(window.history.state?.__loveiqOverlay)))
        .toBe(false);

      await page.goBack();
      await expect(page).toHaveURL(/\/about$/);
    });
  });
}
