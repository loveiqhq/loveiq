/**
 * `locked_card_price_shown` fired 331 times in PostHog while writing ZERO rows
 * to `analytics_event` for five weeks, because it raced the submission context
 * and its one-shot ref made the loss permanent.
 *
 * Verified against the SERVER table, not the client event — the client half was
 * never broken, so asserting on it would pass either way.
 */
import { chromium, devices } from "playwright";
import { sget } from "./supa.mjs";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const TOKEN = process.env.QA_TOKEN_LOCKED ?? "rpt_a9LY0Obbla1FVsclJ1nM";

const count = async () => {
  const rows = await sget(
    "analytics_event?event_type=eq.locked_card_price_shown&select=id,event_time,survey_submission_id&order=id.desc&limit=5"
  );
  return rows;
};

const before = await count();
console.log(
  `BEFORE: ${before.length} locked_card_price_shown rows; newest=${before[0]?.event_time ?? "none"}`
);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "en-US" });
await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
const page = await ctx.newPage();
let posted = 0;
page.on("request", (r) => {
  if (r.url().includes("/api/analytics-event") && r.method() === "POST") posted += 1;
});

await page.goto(`${ORIGIN}/report/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page
  .waitForSelector(".report-status-card__spinner", { state: "detached", timeout: 90_000 })
  .catch(() => {});
await page.waitForTimeout(2500);
// The event is consent-gated, so accepting is part of the scenario, not a shortcut.
await page
  .locator(".cky-btn-accept")
  .first()
  .click({ timeout: 8000 })
  .catch(() => {});
await page.waitForTimeout(6000);
console.log(`POSTs to /api/analytics-event during the visit: ${posted}`);

await ctx.close();
await browser.close();

await new Promise((r) => setTimeout(r, 2500));
const after = await count();
const fresh = after.filter((r) => !before.some((b) => b.id === r.id));
console.log(`AFTER : ${after.length} rows; new this run=${fresh.length}`);
for (const r of fresh)
  console.log(
    `   +id=${r.id} submission=${r.survey_submission_id} at=${r.event_time?.slice(0, 19)}`
  );
console.log(
  fresh.length > 0 ? "PASS: the price-exposure row now persists" : "FAIL: still no durable row"
);
process.exitCode = fresh.length > 0 ? 0 : 1;
