// TEMPORARY end-to-end check of the AP-Analytics tracking, run against a local server on the
// STAGING database (no real data). Not committed.
import { test, expect, type Page } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";

import { surveyQuestions, type SurveyQuestion } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { SURVEY_SESSION_KEY } from "../features/survey/ui/hooks/surveySession";
import { pinSurveySession } from "./surveyArm";
import { openFirstCategory } from "./surveyGroups";
import { instantScroll } from "./fixtures/instant-scroll";

const OUT = process.env.E2E_OUT ?? "/dev/null";
const ARM = "control" as const;
const ASKED: SurveyQuestion[] = orderAskedQuestions(surveyQuestions, ARM).filter(
  (q) => !isHidden(q.qId)
);
const CONSENT =
  "consentid:e2e,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:no";

/** PostHog's batches, read whatever way posthog-js packed them. */
function readPostHog(buf: Buffer | null): Array<Record<string, unknown>> {
  if (!buf) return [];
  let text = "";
  try {
    text = gunzipSync(buf).toString("utf8");
  } catch {
    text = buf.toString("utf8");
    if (text.startsWith("data=")) {
      const b64 = decodeURIComponent(text.slice(5).split("&")[0]!);
      text = Buffer.from(b64, "base64").toString("utf8");
    }
  }
  try {
    const j = JSON.parse(text) as unknown;
    if (Array.isArray(j)) return j as Array<Record<string, unknown>>;
    if (j && typeof j === "object" && Array.isArray((j as { batch?: unknown }).batch))
      return (j as { batch: Array<Record<string, unknown>> }).batch;
    return j && typeof j === "object" ? [j as Record<string, unknown>] : [];
  } catch {
    return [];
  }
}

async function setUp(page: Page, posthog: Array<Record<string, unknown>>) {
  // posthog-js stays silent for a browser that says it is automated.
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false })
  );
  await page.context().addCookies([
    { name: "cookieyes-consent", value: encodeURIComponent(CONSENT), domain: "localhost", path: "/" },
  ]);
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "localhost") return route.abort();
    if (u.pathname.startsWith("/relay")) {
      posthog.push(...readPostHog(route.request().postDataBuffer()));
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
    }
    return route.continue();
  });
}

test("AP tracking end to end (staging data)", async ({ page }) => {
  test.setTimeout(900_000);
  const posthog: Array<Record<string, unknown>> = [];
  await setUp(page, posthog);
  await pinSurveySession(page, ARM);

  // 1. Landing from a search engine with Meta's click id: the tracker keeps both; sections timed.
  await page.goto("/?fbclid=E2E_FB_TRACK_1", { referer: "https://www.google.com/" });
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 18; i += 1) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(600);
  }
  const tracker = await page.evaluate(() => localStorage.getItem("loveiq-utm"));
  await page.goto("/survey"); // leaving the landing: unsent section time goes as a beacon
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const vid = (await page.context().cookies()).find((c) => c.name === "__liq_vid")?.value ?? null;

  // 2. The intro: slide 2 back to 1, then Skip Intro from slide 3.
  await page.getByRole("button", { name: /continue/i }).first().click();
  await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Continue to next slide" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Go to previous slide" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Continue to next slide" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Continue to next slide" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /skip intro/i }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("checkbox").nth(1).locator("div").first().click();
  await page.getByRole("button", { name: /i agree/i }).click();
  const session = await page.evaluate((k) => sessionStorage.getItem(k), SURVEY_SESSION_KEY);

  // 3. The whole survey.
  await instantScroll(page);
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith("/api/survey") && r.request().method() === "POST",
    { timeout: 600_000 }
  );
  for (let i = 0; i < ASKED.length; i += 1) {
    const q = ASKED[i]!;
    await expect(page.getByRole("heading", { name: q.question, exact: true })).toBeVisible({
      timeout: 20_000,
    });
    switch (q.answerType) {
      case "open": {
        const v = q.qId === "00000" ? `ap-e2e-${Date.now()}@example.com` : "E2E";
        const boxes = page.getByRole("textbox");
        for (let b = 0, n = await boxes.count(); b < n; b += 1) await boxes.nth(b).fill(v);
        break;
      }
      case "scale":
        await page.getByRole("button", { name: "4 of 7" }).click();
        break;
      case "single":
        await page.getByRole("radio").first().click();
        break;
      case "multiple":
        await openFirstCategory(page, q);
        await page.getByRole("checkbox").first().click();
        break;
      case "country":
        await page.getByPlaceholder(/search for a country/i).fill("Germany");
        await page.getByRole("option", { name: /^Germany/ }).first().click();
        break;
    }
    await page.getByRole("button", { name: "Next", exact: true }).click({ timeout: 15_000 });
  }
  const res = await submitted;
  const body = (await res.json()) as { reportToken?: string; submissionId?: number };

  // 4. The pre-report wizard: on to slide 1, then Skip Intro.
  const wzSkip = page.locator("button.wz-skip");
  await wzSkip.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.waitForTimeout(1500);
  await wzSkip.click();
  await page.waitForTimeout(3000);

  // 5. The report: read a while, open a chapter's controls, the paywall, then leave.
  await page.goto(`/report/${body.reportToken}`);
  await page.locator("[data-report-section]").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1500);
  }
  const clicked: string[] = [];
  for (const action of ["show_all", "learn_more", "try_this", "open"]) {
    const el = page.locator(`[data-chapter-action="${action}"]:visible`).first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      await el.click().catch(() => {});
      clicked.push(action);
      await page.waitForTimeout(1500);
    }
  }
  const lock = page.locator("[data-paywall-locked]:visible").first();
  let paywall = false;
  if (await lock.count()) {
    await lock.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await lock.click().catch(() => {});
    paywall = true;
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(2000);
  await page.goto("about:blank"); // pagehide: the chapter reading is saved
  await page.waitForTimeout(3000);

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        tracker,
        vid,
        session,
        submissionId: body.submissionId ?? null,
        reportToken: body.reportToken ? "present" : null,
        clicked,
        paywall,
        sectionTime: posthog
          .filter((e) => e.event === "section_time")
          .map((e) => (e.properties as Record<string, unknown>) ?? {})
          .map((p) => ({ section: p.section, visible_ms: p.visible_ms })),
        posthogEvents: [...new Set(posthog.map((e) => String(e.event)))],
      },
      null,
      1
    )
  );
});
