import type { Page } from "@playwright/test";

import type { SurveyQuestion } from "../data/survey-data";
import { optionGroupsFor } from "../features/survey/optionGroups";

/**
 * Helpers for a question whose options sit under collapsible category headings (C9,
 * 16016; see `features/survey/optionGroups.ts`).
 *
 * A closed category is `inert` and `aria-hidden`, so `getByRole("checkbox")` finds none
 * of its topics. Every walk that answers a multi-select by clicking its first checkbox has
 * to open a category first, and every check that reads the rendered order has to open
 * them one by one.
 */

/** The category headings of a grouped question, top to bottom as rendered. */
function categoryHeaders(page: Page, q: SurveyQuestion) {
  return page.locator(`button[aria-controls^="${q.qId}-group-"]`);
}

/** Open the first category of a grouped question, so its topics can be clicked. No-op when flat. */
export async function openFirstCategory(page: Page, q: SurveyQuestion): Promise<void> {
  if (!optionGroupsFor(q)) return;
  const first = categoryHeaders(page, q).first();
  if ((await first.getAttribute("aria-expanded")) !== "true") await first.click();
}

/**
 * Every topic of a grouped question in page order: each category opened in turn, its
 * topics read while it is open. One category is open at a time, so opening the next
 * closes the last, and the checkboxes on screen are only ever that category's.
 */
export async function renderedGroupedOptions(page: Page, q: SurveyQuestion): Promise<string[]> {
  const headers = categoryHeaders(page, q);
  const labels: string[] = [];
  for (let h = 0, n = await headers.count(); h < n; h += 1) {
    await headers.nth(h).click();
    const shown = await page
      .getByRole("checkbox")
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()));
    labels.push(...shown);
  }
  return labels;
}
