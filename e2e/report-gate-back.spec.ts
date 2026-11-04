import { expect, test, type Page } from "@playwright/test";

import { buildInitialGateFixture } from "./fixtures/report";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * The browser's and the phone's own Back on the EUR 1.99 page opens its exit page, as "Not ready
 * to unlock yet" does (card "€1.99 page: replace the browser Back with Marcus's exit page", Eman
 * 04.11; features/report/ui/gate/useGateBack.ts).
 *
 * Before, after the survey, Back left for /survey's "You've already finished", whose "Open my
 * report" came straight back to the EUR 1.99 page: a loop. Now Back goes between the EUR 1.99 page
 * and its exit page and never leaves the report.
 *
 * WHICH "BACK" (as e2e/paywall-back.spec.ts explains):
 *  - page.goBack() is a desktop's Back and an iPhone's swipe: a history traversal on every engine.
 *  - pressBack() is Android's back where there is a CloseWatcher (Chromium, Firefox, WebKit 26.6):
 *    a close request, raised here by an Escape that only the browser hears.
 *
 * Events are read where PostHog is sent them (`window.__loveiqEventTap`, the persona walks' hook),
 * which every engine reaches. WebKit refuses the Secure CSRF cookie on http://localhost, so it
 * stores nothing here.
 */
const GATE_TOKEN = "rpt_e2eGateBackAbCdEfGhIj";
const GATE = `/report/${GATE_TOKEN}`;
const onGate = new RegExp(`${GATE}$`);
const onExitPage = new RegExp(`${GATE}\\?leave=pre$`);

type Tapped = { name: string; props: Record<string, unknown> };

async function tapEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __tapped: Tapped[];
      __loveiqEventTap: (name: string, props: Record<string, unknown>) => void;
    };
    w.__tapped = [];
    w.__loveiqEventTap = (name, props) => w.__tapped.push({ name, props });
  });
}
const tapped = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (window as unknown as { __tapped: Tapped[] }).__tapped
        .filter((e) => e.name === n)
        .map((e) => e.props),
    name
  );

/** A reader who has answered the cookie banner, with nothing sent anywhere. */
async function quietPage(page: Page, baseURL: string | undefined) {
  await page.route("**/api/analytics-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/cdn-cookieyes.com/**", (route) => route.abort());
  await page.context().addCookies([
    {
      name: "cookieyes-consent",
      value: "consentid:e2e,consent:yes,action:yes,necessary:yes",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function mockGate(page: Page) {
  await page.route("**/api/report?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildInitialGateFixture(GATE_TOKEN)),
    })
  );
}

/**
 * The EUR 1.99 page's Back catch is on again: its entry is on top while the page shows. Every call
 * follows the page becoming visible, and the hook takes the entry in a layout effect in the commit
 * that shows the page, so once both hold, a reader's next Back is caught. page.goBack() before it
 * would step past the page.
 */
const caught = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window.history.state as { __loveiqOverlay?: boolean } | null)?.__loveiqOverlay)
      )
    )
    .toBe(true);

/** Android's back where a CloseWatcher hears it; elsewhere a history step, which it then is. */
async function pressBack(page: Page) {
  const closeRequest = await page.evaluate(
    () => typeof (window as unknown as { CloseWatcher?: unknown }).CloseWatcher === "function"
  );
  if (!closeRequest) {
    await page.goBack();
    return;
  }
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
}

const gatePage = (page: Page) => page.locator(".iug-page");
const exitPage = (page: Page) => page.locator(".pge-page");
const alreadyFinished = (page: Page) => page.getByRole("heading", { name: /already finished/i });

async function openGate(page: Page, baseURL: string | undefined) {
  await quietPage(page, baseURL);
  await mockGate(page);
  // The page behind the report, as the landing page is in production.
  await page.goto("/glossary");
  await page.goto(GATE);
  await expect(gatePage(page)).toBeVisible();
  await caught(page);
}

test.describe("Back on the EUR 1.99 page", () => {
  test("opens its exit page and never finds the survey's “already finished” again", async ({
    page,
    baseURL,
  }) => {
    await tapEvents(page);
    await quietPage(page, baseURL);
    await mockGate(page);
    await page.goto("/glossary");
    // A tab that finished the survey, its steps still in history (iPhone Safari keeps them).
    await page.goto("/survey");
    await page.evaluate((token) => {
      sessionStorage.setItem("loveiq-completed-report", token);
      window.history.pushState({ surveyStep: 1 }, "");
      window.history.pushState({ surveyStep: 2 }, "");
    }, GATE_TOKEN);
    await page.reload();
    await expect(alreadyFinished(page)).toBeVisible();

    await page.getByRole("link", { name: /open my report/i }).click();
    await expect(page).toHaveURL(onGate);
    await expect(gatePage(page)).toBeVisible();
    await caught(page);

    for (let round = 1; round <= 3; round += 1) {
      await page.goBack();
      await expect(exitPage(page), `round ${round}: the exit page`).toBeVisible();
      await expect(page).toHaveURL(onExitPage);
      await page.goBack();
      await expect(gatePage(page), `round ${round}: the EUR 1.99 page again`).toBeVisible();
      await expect(exitPage(page)).toHaveCount(0);
      await expect(page).toHaveURL(onGate);
      await caught(page);
    }
    await expect(alreadyFinished(page)).toHaveCount(0);
    // Once a page, as "Not ready to unlock yet" is; that press was never made.
    expect(await tapped(page, "initial_gate_browser_back")).toEqual([{ to: "exit_page" }]);
    expect(await tapped(page, "initial_gate_back")).toEqual([]);
  });

  test("the phone's Back, a close request, opens the exit page, whose own brings the page back", async ({
    page,
    baseURL,
  }) => {
    await tapEvents(page);
    await openGate(page, baseURL);

    await pressBack(page);
    await expect(exitPage(page)).toBeVisible();
    await expect(page).toHaveURL(onExitPage);

    await pressBack(page);
    await expect(gatePage(page)).toBeVisible();
    await expect(exitPage(page)).toHaveCount(0);
    await expect(page).toHaveURL(onGate);
    await caught(page);

    await pressBack(page);
    await expect(exitPage(page)).toBeVisible();
    expect(await tapped(page, "initial_gate_browser_back")).toEqual([{ to: "exit_page" }]);
    // The exit page's Back is counted as it goes, as a phone's Back always was.
    await expect
      .poll(() => tapped(page, "paygate_exit_leave"))
      .toEqual([{ stage: "pre", via: "browser_back" }]);
  });

  test("Escape leaves the page and its exit page as they are", async ({ page, baseURL }) => {
    await tapEvents(page);
    await openGate(page, baseURL);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(gatePage(page)).toBeVisible();
    await expect(page).toHaveURL(onGate);

    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(exitPage(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(exitPage(page)).toBeVisible();
    await expect(page).toHaveURL(onExitPage);
    expect(await tapped(page, "initial_gate_browser_back")).toEqual([]);
  });

  // "Not ready to unlock yet" opens the exit page over the catch's entry; "Maybe later" comes
  // back onto it. Taken over (shared/ui/overlay-history.ts), the next Back is caught at once,
  // not a dead press on a second entry.
  test("after “Not ready” and “Maybe later”, the next Back opens the exit page at once", async ({
    page,
    baseURL,
  }) => {
    await openGate(page, baseURL);
    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(exitPage(page)).toBeVisible();
    await page.getByRole("button", { name: "Maybe later" }).click();
    await expect(gatePage(page)).toBeVisible();
    await expect(page).toHaveURL(onGate);
    await caught(page);

    await page.goBack();
    await expect(exitPage(page)).toBeVisible();
    await expect(page).toHaveURL(onExitPage);
  });

  test("Back from an abandoned checkout finds the page, and the next Back its exit page", async ({
    page,
    baseURL,
  }) => {
    await openGate(page, baseURL);
    const stripe = `${baseURL}/about?stripe=checkout`;
    await page.route("**/api/stripe/initial-unlock", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true, url: stripe }),
      })
    );
    await page.locator(".iug-card .rpg-card__cta").click();
    await expect(page).toHaveURL(stripe);

    await page.goBack();
    await expect(page).toHaveURL(onGate);
    await expect(gatePage(page)).toBeVisible();
    await caught(page);
    await page.goBack();
    await expect(exitPage(page)).toBeVisible();
    await expect(page).toHaveURL(onExitPage);
  });

  test("after a reload of the page, Back still opens its exit page", async ({ page, baseURL }) => {
    await openGate(page, baseURL);
    await page.reload();
    await expect(gatePage(page)).toBeVisible();
    await caught(page);

    await page.goBack();
    await expect(exitPage(page)).toBeVisible();
    await expect(page).toHaveURL(onExitPage);
  });
});

test.describe("Back on the EUR 1.99 page after the tour", () => {
  const PREVIEW = "/report?preview=1&v4=1&gate=tour";
  const bubble = (page: Page) => page.locator(".rv4-tour__bubble[data-state='in']");

  /** Next through every stop, then Finish. */
  async function walkTour(page: Page) {
    for (;;) {
      await expect(bubble(page)).toBeVisible();
      const finish = bubble(page).getByRole("button", { name: "Finish", exact: true });
      if (await finish.isVisible()) {
        await finish.click();
        return;
      }
      await bubble(page).getByRole("button", { name: "Next", exact: true }).click();
    }
  }

  // The exit page opens at its own top, and its Back finds the page where the reader left it.
  // Safari would put back the scroll the entry was left at instead (history held at "manual").
  test("opens the exit page at its top, and the next Back finds the page where it was", async ({
    page,
    baseURL,
  }) => {
    await tapEvents(page);
    await instantScroll(page);
    await quietPage(page, baseURL);
    await page.goto(PREVIEW);
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await walkTour(page);
    await expect(gatePage(page)).toBeVisible({ timeout: 15_000 });
    await caught(page);

    await page.locator(".iug-sections").scrollIntoViewIfNeeded();
    const left = await page.evaluate(() => window.scrollY);
    expect(left, "the reader is down the page").toBeGreaterThan(100);

    await page.goBack();
    await expect(exitPage(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(gatePage(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(Math.round(left));
    expect(await tapped(page, "initial_gate_browser_back")).toEqual([{ to: "exit_page" }]);
  });
});
