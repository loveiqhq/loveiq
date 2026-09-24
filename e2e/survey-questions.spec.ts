import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions, type SurveyQuestion } from "../data/survey-data";
import { isHidden, RANDOMISE_QIDS } from "../features/survey/questionFlags";
import { orderEmailLast, orderedOptions } from "../features/survey/ui/questionOrder";

/**
 * Walks the whole survey in a real browser and checks the three behaviours the survey
 * work order added, none of which any other test exercises end to end:
 *
 *   C0  answer options are shown in a randomised order, and the order shown is exactly
 *       the order the submit path would record against the submission
 *   C5  16001 caps at two picks, C7 16014 caps at one, both with the limit copy visible
 *   C11 16009 renders its five priced formats, in fixed order, "None of these" last
 *
 * The existing survey spec stops at question two, so everything from 16001 onwards had
 * only unit coverage.
 *
 * NOTHING IS WRITTEN. Staging and production share one Supabase database (two Vercel
 * projects, one DB), so a survey run here is a survey run against real data. Every write
 * endpoint is intercepted below and answered locally; the run never reaches a submission.
 */

const ASKED: SurveyQuestion[] = orderEmailLast(surveyQuestions).filter((q) => !isHidden(q.qId));

/**
 * The caps the work order specifies, written out rather than read from `maxSelections`.
 *
 * Reading the expected value from the same data the UI reads makes the assertion a
 * tautology: change the CSV to five and both sides move together and the test still
 * passes. These two numbers are the requirement — 16001 "exactly two", 16014 "exactly
 * one" — so they belong in the test.
 */
const EXPECTED_CAPS: Record<string, number> = { "16001": 2, "16014": 1 };

/** Endpoints the survey writes through. All stubbed — see the note above. */
const WRITE_ROUTES = [
  "**/api/survey",
  "**/api/survey-partial",
  "**/api/survey-tracking",
  "**/api/analytics-event",
];

async function blockWrites(page: Page) {
  for (const pattern of WRITE_ROUTES) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
}

async function enterEngine(page: Page) {
  await page.goto("/survey");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  // "Skip intro" only exists from slide 1 onwards, so step off the intro screen first.
  await page
    .getByRole("button", { name: /continue/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /skip intro/i }).click();
  await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("checkbox").first().click();
  await page.getByRole("checkbox").nth(1).locator("div").first().click();
  await page.getByRole("button", { name: /i agree/i }).click();
}

/** The option labels currently on screen, top to bottom as rendered. */
async function renderedOptions(page: Page, role: "radio" | "checkbox"): Promise<string[]> {
  const labels = await page
    .getByRole(role)
    .evaluateAll((nodes) => nodes.map((n) => (n.textContent ?? "").trim()));
  // ChoiceCard renders the label plus an optional explanation; match on the leading label.
  return labels;
}

/**
 * Answer whichever question is on screen, then make sure we land on the next one.
 *
 * single / scale / country auto-advance after 350ms; open and multiple do not. Rather
 * than encode that per type, answer and then wait for the heading to change — falling
 * back to Next when it does not. That keeps the driver correct if auto-advance changes.
 */
async function answerAndAdvance(page: Page, q: SurveyQuestion, nextHeading: string | null) {
  switch (q.answerType) {
    case "open": {
      // The email question renders a confirmation field too, and Next stays disabled
      // until both match — so fill every textbox on the question, not just the first.
      const value = q.qId === "00000" ? "e2e-no-submit@loveiq.org" : "E2E";
      const boxes = page.getByRole("textbox");
      const count = await boxes.count();
      for (let b = 0; b < count; b += 1) await boxes.nth(b).fill(value);
      break;
    }
    case "scale":
      await page.getByRole("button", { name: "4 of 7" }).click();
      break;
    case "single":
      await page.getByRole("radio").first().click();
      break;
    case "multiple":
      await page.getByRole("checkbox").first().click();
      break;
    case "country":
      await page.getByPlaceholder(/search for a country/i).fill("Germany");
      await page.getByRole("option").first().click();
      break;
    default:
      throw new Error(`unhandled answerType ${q.answerType} on ${q.qId}`);
  }

  if (!nextHeading) return;
  const next = page.getByRole("heading", { name: nextHeading, exact: true });
  try {
    await next.waitFor({ state: "visible", timeout: 1200 });
  } catch {
    /**
     * THE CLICK IS A NUDGE. THE HEADING IS THE ASSERTION.
     *
     * Two different situations are indistinguishable at this point: a question that
     * genuinely needs Next (open, multiple), and an auto-advance that was merely slow.
     * 1200ms is 350ms of auto-advance plus headroom, and a cold Desktop Firefox on a
     * CI runner spends more than that on the first transition.
     *
     * In the slow-auto-advance case the page is already moving, so Next is sliding out
     * from under the cursor and `.click()` fails its "visible, enabled and STABLE"
     * check — measured on Desktop Firefox, flaky on 2026-09-21's first CI run and an
     * outright failure on the next. That is a flake, not a defect: the survey did
     * exactly what it should. Letting a failed nudge fail the test is what made this
     * the only genuinely unreliable spec in the suite.
     *
     * So the nudge is best-effort and the heading below is what decides. A question
     * that really did need Next and really did not advance still fails here, because
     * the heading never arrives.
     */
    await page
      .getByRole("button", { name: /next/i })
      .click({ timeout: 4000 })
      .catch(() => {});
    await next.waitFor({ state: "visible", timeout: 8000 });
  }
}

test.describe("Survey — the questions the work order changed", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("randomised order, selection caps and the priced question, walked end to end", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await blockWrites(page);
    await enterEngine(page);

    // Read after the engine has mounted: the id is created lazily on first use.
    await expect(page.getByRole("heading", { name: ASKED[0]!.question, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const sessionId = await page.evaluate(() =>
      window.sessionStorage.getItem("loveiq-survey-session")
    );
    expect(sessionId, "survey session id must exist — the shuffle is seeded from it").toBeTruthy();

    const shuffledSomewhere: string[] = [];
    let checkedCaps = 0;
    let checkedPriced = 0;

    for (let i = 0; i < ASKED.length; i += 1) {
      const q = ASKED[i]!;
      const nextQ = ASKED[i + 1] ?? null;

      // Being on the right question at the right index also proves the hidden question
      // (15011) really is skipped — the walk would desynchronise otherwise.
      await expect(
        page.getByRole("heading", { name: q.question, exact: true }),
        `expected question ${i + 1}/${ASKED.length} to be ${q.qId}`
      ).toBeVisible({ timeout: 10_000 });

      if (RANDOMISE_QIDS.has(q.qId)) {
        // C0. The order on screen must equal the order `useSubmitSurvey` recomputes for
        // this session — that equality IS the feature. If they can differ, the recorded
        // order is a fiction and the rankings built on it are worse than no data.
        const shown = await renderedOptions(page, "checkbox");
        const expected = orderedOptions(q, sessionId!);
        expect(shown.length, `${q.qId} option count`).toBe(expected.length);
        shown.forEach((label, idx) => {
          expect(label, `${q.qId} option ${idx + 1}`).toContain(expected[idx]!);
        });
        if (JSON.stringify(expected) !== JSON.stringify(q.options)) {
          shuffledSomewhere.push(q.qId);
        }
      }

      if (q.qId in EXPECTED_CAPS) {
        // C5 / C7. Try to exceed the cap and confirm the UI refuses and says why.
        const cap = EXPECTED_CAPS[q.qId]!;
        expect(q.maxSelections, `${q.qId} cap in survey data`).toBe(cap);
        const boxes = page.getByRole("checkbox");
        const total = await boxes.count();
        for (let c = 0; c < Math.min(cap + 1, total); c += 1) await boxes.nth(c).click();

        const checked = await boxes.evaluateAll(
          (nodes) => nodes.filter((n) => n.getAttribute("aria-checked") === "true").length
        );
        expect(checked, `${q.qId} must stop at ${cap} picks`).toBe(cap);
        await expect(
          page.getByText(new RegExp(`select up to ${cap} option`, "i")),
          `${q.qId} must explain the cap`
        ).toBeVisible();

        // Leave exactly the cap selected and move on.
        checkedCaps += 1;
      }

      if (q.qId === "16009") {
        // C11. Fixed order, prices intact, opt-out last, and NOT randomised.
        const shown = await renderedOptions(page, "radio");
        expect(shown.length).toBe(5);
        shown.forEach((label, idx) => expect(label).toContain(q.options[idx]!));
        expect(shown[4]).toContain("None of these right now");
        expect(shown.join(" ")).toContain("€19");
        expect(shown.join(" ")).toContain("€229");
        expect(RANDOMISE_QIDS.has("16009")).toBe(false);
        checkedPriced += 1;
      }

      // 16001/16014 already have their picks; advancing only needs Next.
      if (q.qId in EXPECTED_CAPS) {
        const next = nextQ
          ? page.getByRole("heading", { name: nextQ.question, exact: true })
          : null;
        await page.getByRole("button", { name: /next/i }).click();
        if (next) await next.waitFor({ state: "visible", timeout: 5000 });
        continue;
      }

      await answerAndAdvance(page, q, nextQ ? nextQ.question : null);
    }

    expect(checkedCaps, "both capped questions were reached").toBe(2);
    expect(checkedPriced, "the priced question was reached").toBe(1);
    expect(
      shuffledSomewhere.length,
      "at least one randomised question must actually differ from authored order"
    ).toBeGreaterThan(0);

    // The walk ended on the last question without ever submitting.
    expect(ASKED[ASKED.length - 1]!.qId).toBe("16015");
  });
});

/**
 * A browser that refuses storage still gets a survey.
 *
 * Safari with "Block All Cookies", and WebViews with DOM storage switched off,
 * throw a SecurityError on EVERY localStorage / sessionStorage access. That was
 * checked once, by hand, on 2026-09-09 by a probe nothing ever ran (deleted
 * 2026-09-24). By 2026-09-24 it could not get past the intro even
 * with storage working, so it had been reporting a failure about itself. This
 * replaces it and runs on every push.
 *
 * Only errors from OUR bundles count (a /_next/ frame). A third-party script
 * that trips over the same storage is someone else's problem, and an error with
 * no stack cannot be attributed; see features/ux-review "an error with no
 * source is not ours".
 */
test.describe("Survey — a browser that refuses storage", () => {
  test("still opens, and answering moves the reader forward", async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      };
      const refused = {
        getItem: boom,
        setItem: boom,
        removeItem: boom,
        clear: boom,
        key: boom,
        get length(): number {
          return boom();
        },
      };
      Object.defineProperty(window, "localStorage", { configurable: true, get: () => refused });
      Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => refused });
    });
    const ours: string[] = [];
    page.on("pageerror", (e) => {
      const stack = String(e.stack ?? "");
      if (stack.includes("/_next/")) ours.push(`${e.message} :: ${stack.split("\n")[1] ?? ""}`);
    });
    await blockWrites(page);

    // The mechanism the test relies on: storage really does throw on this page.
    await page.goto("/survey");
    const threw = await page.evaluate(() => {
      try {
        localStorage.getItem("x");
        return false;
      } catch {
        return true;
      }
    });
    expect(threw, "the storage refusal did not take effect in this engine").toBe(true);

    await enterEngine(page);
    for (let i = 0; i < 2; i += 1) {
      await expect(
        page.getByRole("heading", { name: ASKED[i]!.question, exact: true })
      ).toBeVisible({ timeout: 10_000 });
      await answerAndAdvance(page, ASKED[i]!, ASKED[i + 1]!.question);
    }
    await expect(
      page.getByRole("heading", { name: ASKED[2]!.question, exact: true })
    ).toBeVisible();
    expect(ours, "our own code threw with storage refused").toEqual([]);
  });
});
