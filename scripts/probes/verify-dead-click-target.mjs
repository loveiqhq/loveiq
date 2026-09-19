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

    /**
     * Walk to the step the element actually lives on.
     *
     * /survey opens on the intro screen, and almost nothing a reader taps is
     * there: on 30 days of production EVERY missed control the bench names is
     * on /survey, and not one of them — `button.flex`, `button.relative`,
     * `button.flex-1`, `button.hidden` — exists on step 0. So this probe
     * answered "no element matches it on this page any more" for all of them
     * and exited 3, which is honest but unmeasurable, and is a large part of
     * why no finding has ever been reproduced.
     *
     * `loadInitialStep()` (features/survey/ui/SurveyPage.tsx) reads
     * SURVEY_STEP_KEY verbatim for any value in 0..TOTAL_STEPS+2, so setting it
     * and reloading lands on that step deterministically. Walking beats clicking
     * CONTINUE: the survey's entry animation keeps Playwright's stability check
     * from settling, so `.click()` on it times out rather than advancing.
     *
     * Only the step moves. If the element is still absent at every step it is
     * genuinely gone, and exit 3 is then the true answer.
     */
    const seesTarget = () =>
      page.evaluate((sel) => {
        try {
          return [...document.querySelectorAll(sel)].some((n) => {
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
        } catch {
          return false; // unparseable selector — reported by the measurement
        }
      }, SELECTOR);

    let foundAtStep = (await seesTarget()) ? 0 : null;
    if (foundAtStep === null && URL_PATH.startsWith("/survey")) {
      for (let step = 1; step <= 6; step += 1) {
        await page.evaluate((v) => {
          try {
            sessionStorage.setItem("loveiq-survey-step", v);
          } catch {
            /* blocked — the reload just lands on step 0 again */
          }
        }, String(step));
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1500);
        if (await seesTarget()) {
          foundAtStep = step;
          break;
        }
      }
    }
    const at = foundAtStep === null ? "" : ` (step ${foundAtStep})`;

    if (process.env.MUTATE === "1") {
      /**
       * role=button AND aria-disabled, not aria-disabled alone.
       *
       * The first version set only aria-disabled, which does nothing unless the
       * element already matches the interactive selector. Most real dead-click
       * targets are decoration — the top three on production are `div.flex`,
       * `p.font-sans` and `div.relative` — so the mutation was a no-op on
       * exactly the inputs this probe is usually given, and MUTATE=1 exited 0.
       * A probe that passes with its own defect injected is measuring nothing.
       *
       * Making the target a disabled control works whatever it started as, so
       * the mutation is deterministic for any selector.
       */
      await page.evaluate((sel) => {
        // The SAME element the measurement will pick: the first VISIBLE match.
        // Mutating `querySelector`'s first match while the measurement reads the
        // first visible one targets two different elements, and MUTATE=1 then
        // exits 0 on any page where the first match is hidden.
        const el = [...document.querySelectorAll(sel)].find((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (!el) return;
        el.setAttribute("role", "button");
        el.setAttribute("aria-disabled", "true");
      }, SELECTOR);
      await page.waitForTimeout(200);
    }

    const r = await page.evaluate((sel) => {
      let all;
      try {
        all = [...document.querySelectorAll(sel)];
      } catch {
        // selectorFor caps at 120 chars and can emit something querySelector
        // refuses. That is a probe limitation, never a product defect.
        return { badSelector: true };
      }
      if (all.length === 0) return { missing: true };

      /**
       * Every VISIBLE match, and the DEAD one wins.
       *
       * `selectorFor()` keeps only the tag and the first class, so one selector
       * routinely names several controls. Taking the first visible match is a
       * coin flip, and on the consent gate it lands the wrong way every time:
       * `button.flex-1` matches "Return to site" (live) and "I agree"
       * (`disabled={!canProceed}`) at the SAME y, in that order. The probe read
       * the live one and cleared the finding — the exact control 15 readers
       * pressed to no effect, reported as a pass.
       *
       * The event has already established that a reader tapped something dead
       * under this selector. The question left for the probe is only whether
       * such a control is still on the page, so if ANY visible match is dead,
       * the finding stands. The trade-off is deliberate: a page where one
       * legitimately-disabled sibling shares a selector will now report FAIL.
       * That is the safe direction — the alternative silently clears real ones.
       *
       * (Zero-size matches are still skipped: on /survey the first match in
       * document order has no box, and the reader tapped something they saw.)
       */
      const measure = (el) => {
        const rect = el.getBoundingClientRect();

        // Same definition as isInteractive() in uxSignals, deliberately.
        const control = el.closest(
          "a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[contenteditable=true]"
        );
        const disabled =
          !!control &&
          (control.disabled === true || control.getAttribute("aria-disabled") === "true");

        /**
         * A disabled control that EXPLAINS ITSELF is not a dead end.
         *
         * "Disabled" alone was too blunt a rule. The survey consent gate keeps
         * "I agree" disabled until both boxes are ticked, which is correct and
         * must not change — so once the missing explanation was added, this
         * probe still reported the defect and, D1 being in AUTO_PR_CRITERIA,
         * would have opened a draft pull request against correct behaviour on
         * every run, forever.
         *
         * `aria-describedby` is the right signal rather than a heuristic: it is
         * exactly what a screen reader announces when the control takes focus,
         * so a control that satisfies this check has genuinely told the reader
         * why. Required to resolve to VISIBLE, non-empty text — an id pointing
         * at nothing, or at a hidden node, is the same dead end wearing an
         * attribute.
         */
        const describedBy = control?.getAttribute("aria-describedby") ?? "";
        const explained = describedBy
          .split(/\s+/)
          .filter(Boolean)
          .some((id) => {
            const node = document.getElementById(id);
            if (!node) return false;
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (node.textContent ?? "").trim().length > 0;
          });

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
          disabled: disabled && !explained,
          explained: disabled && explained,
          covered,
          inViewport,
          coveredBy: covered
            ? `${top.tagName.toLowerCase()}.${String(top.className).split(" ")[0]}`
            : null,
          tag: el.tagName.toLowerCase(),
          label: (el.innerText || "").trim().slice(0, 30),
        };
      };

      const visible = all.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible.length === 0) return { notRendered: true, matches: all.length };

      const measured = visible.map(measure);
      const worst =
        measured.find((m) => m.looksPressable && (m.disabled || m.covered)) ??
        measured.find((m) => m.explained) ??
        measured[0];
      return { ...worst, matches: visible.length };
    }, SELECTOR);

    const where = `${name.padEnd(14)}`;
    if (r.badSelector || r.missing || r.notRendered) {
      unmeasured += 1;
      const why = r.badSelector
        ? "the recorded selector is not valid CSS"
        : r.missing
          ? "no element matches it on this page any more"
          : `${r.matches} matches, none of them visible`;
      console.log(`INCONCLUSIVE ${where} ${why}`);
    } else if (r.disabled) {
      dead += 1;
      console.log(
        `FAIL  ${where}${at} <${r.tag}> "${r.label}" is a DISABLED control — ` +
          `it looks live and does nothing (${r.matches} matched this selector)`
      );
    } else if (r.looksPressable && r.covered) {
      dead += 1;
      console.log(
        `FAIL  ${where}${at} <${r.tag}> "${r.label}" looks pressable but the tap lands on ${r.coveredBy}`
      );
    } else if (!r.looksPressable) {
      console.log(
        `PASS  ${where} <${r.tag}> is ordinary content, not a control — a tap on it is not a defect`
      );
    } else if (r.explained) {
      console.log(
        `PASS  ${where}${at} <${r.tag}> "${r.label}" is disabled but SAYS WHY — ` +
          `blocked with an explanation is not a dead end`
      );
    } else {
      console.log(`PASS  ${where}${at} <${r.tag}> is a live control and reachable`);
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
