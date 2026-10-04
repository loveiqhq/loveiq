import { test, expect, type Locator } from "@playwright/test";

// The screens a reader sees when their report cannot load. Both bugs here were found
// on 2026-10-04 from a session recording and the live site:
//  - "Reload report" went to bare /report, which only works in the browser that took
//    the survey, so from an emailed link it could only say "Can't find your report".
//  - These screens render outside .report-page, so .report-button had no background:
//    its white label vanished into the white card and the button was an empty pill.

/** The button's own background, which must not be transparent under a white label. */
async function background(button: Locator): Promise<string> {
  return button.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe("Report status screens", () => {
  test("a failed load offers a readable Reload that keeps the reader's link", async ({ page }) => {
    await page.route("**/api/report**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"x"}' })
    );
    await page.goto("/report/test-token-status");

    await expect(page.getByRole("heading", { name: /temporarily unavailable/i })).toBeVisible();
    const reload = page.getByRole("link", { name: /reload report/i });
    await expect(reload).toHaveAttribute("href", "/report/test-token-status");
    expect(await background(reload)).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("a malformed link reads as not found, with a readable way on", async ({ page }) => {
    await page.route("**/api/report**", (route) =>
      route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"x"}' })
    );
    await page.goto("/report/" + encodeURIComponent("[object Object]"));

    await expect(page.getByRole("heading", { name: /can.t find your report/i })).toBeVisible();
    const onward = page.getByRole("link", { name: /taken the test yet/i });
    expect(await background(onward)).not.toBe("rgba(0, 0, 0, 0)");
  });
});
