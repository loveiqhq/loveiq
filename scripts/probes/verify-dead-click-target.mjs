/**
 * Was the thing this reader tapped actually dead?
 *
 * WHY THIS PROBE IS DIFFERENT. Every other probe verifies the product: it walks
 * a journey chosen in advance and measures a control chosen in advance. This one
 * verifies THE SESSION. `dead_click` and `rage_click` are our own events, and
 * they already carry `pathname` and a real CSS `target_selector` built by
 * `selectorFor()` in shared/observability/uxSignals.ts. Nothing read them until
 * now, so the verifier asked a language model what the reader touched — and the
 * model's stated mechanism has been wrong in 5 of 5 measured findings, at
 * 0.8-1.0 confidence. The event is not a narration. It either fired or it did
 * not, and it names the element.
 *
 * WHAT COUNTS AS DEAD. Mirrors `isInteractive()` in uxSignals, or it would be
 * measuring a different thing than the event that fired:
 *
 *   - a DISABLED control is the defect. It looks live, a reader taps it, and
 *     nothing happens. The instrumentation's own note records readers tapping a
 *     disabled survey "Next" 1,347 times.
 *   - a control that is enabled but COVERED is the same defect by another route:
 *     the tap never reaches it.
 *   - a paragraph, heading, image or badge is NOT a defect. The dead-click
 *     scanner's prompt carries a HARD RULE saying so, and this probe agrees
 *     rather than quietly disagreeing with it.
 *
 *   URL_PATH=/survey TARGET_SELECTOR='button#next.primary' node scripts/probes/verify-dead-click-target.mjs
 *   DEVICES=…        comma-separated Playwright device names
 *   MUTATE=1         disables the element, so a live control must FAIL
 *
 * Exit 0 clean · 1 the control was dead · 3 could not measure.
 */
import { chromium, webkit, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const URL_PATH = process.env.URL_PATH ?? "/";
const SELECTOR = process.env.TARGET_SELECTOR ?? "";
const DEVICE_NAMES = (process.env.DEVICES ?? "Pixel 7,iPhone 15 Pro")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

if (!SELECTOR) {
  console.log("INCONCLUSIVE — no TARGET_SELECTOR given, nothing to look at");
  process.exit(3);
}

let dead = 0;
let unmeasured = 0;

for (const name of DEVICE_NAMES) {
  const engine = /iphone|ipad/i.test(name) ? webkit : chromium;
  const browser = await engine.launch();
  const ctx = await browser.newContext({ ...devices[name], locale: "en-US" });
  await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
  const page = await ctx.newPage();

  try {
    await page.goto(`${ORIGIN}${URL_PATH}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000);

    // The cookie banner owns the pixels of anything near the bottom edge, so a
    // covered-by test would blame it for every low element on a first visit.
    await page
      .locator(".cky-btn-accept")
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    await page.waitForTimeout(600);

    if (process.env.MUTATE === "1") {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.setAttribute("aria-disabled", "true");
      }, SELECTOR);
      await page.waitForTimeout(200);
    }

    const r = await page.evaluate((sel) => {
      let el;
      try {
        el = document.querySelector(sel);
      } catch {
        // selectorFor caps at 120 chars and can emit something querySelector
        // refuses. That is a probe limitation, never a product defect.
        return { badSelector: true };
      }
      if (!el) return { missing: true };

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return { notRendered: true };

      // Same definition as isInteractive() in uxSignals, deliberately.
      const control = el.closest(
        "a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[contenteditable=true]"
      );
      const disabled =
        !!control &&
        (control.disabled === true || control.getAttribute("aria-disabled") === "true");

      let pointer = false;
      let node = el;
      for (let i = 0; node && i < 3; i += 1, node = node.parentElement) {
        if (getComputedStyle(node).cursor === "pointer") {
          pointer = true;
          break;
        }
      }

      // Does a tap at its own centre actually land on it?
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const inViewport = cy >= 0 && cy <= window.innerHeight;
      const top = inViewport ? document.elementFromPoint(cx, cy) : null;
      const covered = inViewport && !!top && top !== el && !el.contains(top) && !top.contains(el);

      return {
        looksPressable: !!control || pointer,
        disabled,
        covered,
        inViewport,
        coveredBy: covered
          ? `${top.tagName.toLowerCase()}.${String(top.className).split(" ")[0]}`
          : null,
        tag: el.tagName.toLowerCase(),
      };
    }, SELECTOR);

    const where = `${name.padEnd(14)}`;
    if (r.badSelector || r.missing || r.notRendered) {
      unmeasured += 1;
      const why = r.badSelector
        ? "the recorded selector is not valid CSS"
        : r.missing
          ? "no element matches it on this page any more"
          : "the element has no box";
      console.log(`INCONCLUSIVE ${where} ${why}`);
    } else if (r.disabled) {
      dead += 1;
      console.log(
        `FAIL  ${where} <${r.tag}> is a DISABLED control — it looks live and does nothing`
      );
    } else if (r.looksPressable && r.covered) {
      dead += 1;
      console.log(`FAIL  ${where} <${r.tag}> looks pressable but the tap lands on ${r.coveredBy}`);
    } else if (!r.looksPressable) {
      console.log(
        `PASS  ${where} <${r.tag}> is ordinary content, not a control — a tap on it is not a defect`
      );
    } else {
      console.log(`PASS  ${where} <${r.tag}> is a live control and reachable`);
    }
  } catch (err) {
    unmeasured += 1;
    console.log(`INCONCLUSIVE ${name} ${String(err.message).split("\n")[0].slice(0, 70)}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

console.log("");
if (dead > 0) {
  console.log(`FAIL (${dead}) — the reader tapped a control that could not respond`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`INCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log(`PASS — what this reader tapped at ${URL_PATH} behaves`);
