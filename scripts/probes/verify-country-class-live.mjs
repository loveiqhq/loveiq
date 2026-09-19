/**
 * Measure what the country input's REAL class list resolves to under the REAL
 * production stylesheet, at phone width and at desktop width.
 *
 * Driving the live survey to question 38 proved too flaky to rely on, so the
 * chain is split in two and both halves are evidence from production:
 *   1. the deployed JS bundle contains this exact class string (grepped), so
 *      the component really does render it;
 *   2. this probe loads a production page — same stylesheets — injects that
 *      class list and reads `getComputedStyle`.
 *
 * Below 16px at phone width is what makes iOS magnify the page and never undo
 * it, so 16px here is the whole point. 15px at >=640px is intended: desktop has
 * no auto-zoom and the design is unchanged there.
 */
import { webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
// Verbatim from features/survey/ui/questions/CountryQuestion.tsx
const COUNTRY_INPUT_CLASS =
  "w-full rounded-xl border py-3 font-sans text-[16px] sm:text-[15px] focus:outline-none";

const browser = await webkit.launch();
for (const [name, expectPhone] of [
  ["iPhone 15 Pro", true],
  ["iPhone SE", true],
  ["Desktop Safari", false],
]) {
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3500);

  const r = await page.evaluate((cls) => {
    const el = document.createElement("input");
    el.type = "text";
    el.className = cls;
    document.body.appendChild(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    el.remove();
    return { fontSize: fs, innerWidth: window.innerWidth };
  }, COUNTRY_INPUT_CLASS);

  const safe = r.innerWidth < 640 ? r.fontSize >= 16 : true;
  const verdict =
    r.innerWidth < 640
      ? r.fontSize >= 16
        ? "PASS — iOS will NOT auto-zoom"
        : "FAIL — still under 16px"
      : `desktop (${r.fontSize}px, unchanged by design)`;
  console.log(
    `${safe ? "PASS" : "FAIL"} ${name.padEnd(15)} width=${r.innerWidth}px  computed font-size=${r.fontSize}px  ${verdict}`
  );
  await ctx.close();
}
await browser.close();
