/**
 * Can a first-time visitor ever press the page's primary CTA?
 *
 * The CookieYes banner is bottom-pinned, fixed, 316px tall on every phone
 * measured, at z-index 9999999. On a 568-660px viewport that is half the
 * screen, and it lands on top of the button the page exists to get pressed.
 *
 * The bar here is REACHABILITY, not "clear on arrival". Every site with a
 * consent banner covers something on arrival, and the banner is meant to demand
 * attention — failing that would be noise. What is not acceptable is a CTA that
 * cannot be brought clear at ANY scroll position, because then the only way
 * forward is to notice the banner and deal with it first. On /survey the
 * Continue button needed 57-281px of scroll while the page offered 12-236px:
 * genuinely trapped, on all three short phones, until the fix in globals.css
 * reserved space for the banner.
 *
 * Geometry, not guesswork. With the CTA at document offset `docY`, height `h`,
 * and the banner's top edge at viewport `bannerTop`, the CTA is fully clear at
 * scroll offset S exactly when  docY + h - bannerTop <= S <= docY.  Reachable
 * iff that range intersects [0, maxScroll]. The probe then SCROLLS THERE and
 * hit-tests five points, because a computed range that no real scroll satisfies
 * would be a proof about the wrong page.
 *
 *   MUTATE=1   removes the reserved space, so a fixed page must FAIL
 *   SIMULATE=1 stand in for the banner. CookieYes only renders on its own
 *              registered domain, so a local build never shows one and every
 *              row is INCONCLUSIVE. This injects an element with the real
 *              classes and the real measured geometry (316px, fixed, bottom,
 *              z-index 9999999) so a build can be checked before it ships.
 *              Never automatic: a simulated banner that appeared by default
 *              would turn "the banner is gone" into a silent pass.
 *   DEVICES=…  comma-separated Playwright device names
 *   PAGES=…    comma-separated of: landing, survey
 *   REPORT_ORIGIN=http://localhost:3100   test a build before it ships
 *
 * Exit 0 clean · 1 a CTA is unreachable · 3 could not measure.
 */
import { webkit, chromium, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";

const PAGES = {
  // Identified by WHERE IT GOES, not by wording: the landing hero reads "Start
  // my free test" on WebKit and "Start test now" on Chromium, and a text regex
  // reported "no primary CTA found" on half the matrix.
  landing: { path: "/", selector: 'a[href*="/survey"]', skipTop: 80 },
  survey: { path: "/survey", selector: "button", text: /^continue$/i },
  /**
   * The consent gate, where a reachable CTA is not enough.
   *
   * "I agree" is `disabled={!canProceed}` and `canProceed = ageConfirmed &&
   * termsAccepted`, so the two checkboxes ABOVE it are what make it work. This
   * probe used to check the button alone and passed every row — while on a
   * first visit the banner covered the second checkbox on a Pixel 7 and BOTH
   * checkboxes on an iPhone SE, where it owns 252-568 of a 568px screen.
   *
   * A reader can scroll the button clear without the checkbox ever being clear,
   * press it, and get nothing: 15 of them did, and `dead_click` recorded every
   * one on `button.flex-1` at /survey. Checking the CTA and not its
   * precondition is how a green probe sat on top of that for the whole time.
   *
   * `pick: "last"` because the lower checkbox is the one the banner reaches.
   */
  consent: {
    path: "/survey",
    step: 5,
    selector: "[role=checkbox]",
    pick: "last",
  },
};

const wanted = (process.env.PAGES ?? "landing,survey,consent").split(",").map((s) => s.trim());
const deviceNames = (process.env.DEVICES ?? "iPhone 15 Pro,iPhone SE,Pixel 7,Galaxy S9+")
  .split(",")
  .map((s) => s.trim());

let trapped = 0;
let unmeasured = 0;

for (const deviceName of deviceNames) {
  const engine = /iphone|ipad/i.test(deviceName) ? webkit : chromium;
  const browser = await engine.launch();

  for (const key of wanted) {
    const spec = PAGES[key];
    if (!spec) continue;

    // A FRESH context each time: the consent cookie is what dismisses the
    // banner, so a reused one would measure the second visit, not the first.
    const ctx = await browser.newContext({ ...devices[deviceName], locale: "en-US" });
    await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
    const page = await ctx.newPage();
    const where = `${deviceName.padEnd(14)} ${key.padEnd(8)}`;

    try {
      await page.goto(`${ORIGIN}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(3000);

      // `loadInitialStep()` honours SURVEY_STEP_KEY for 0..TOTAL_STEPS+2, so a
      // set-and-reload lands on the step deterministically. The consent cookie
      // is untouched, so the banner is still the first-visit one.
      if (spec.step !== undefined) {
        await page.evaluate((v) => {
          try {
            sessionStorage.setItem("loveiq-survey-step", v);
          } catch {
            /* blocked — the reload lands on step 0 and the row reads as a miss */
          }
        }, String(spec.step));
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(3000);
      }

      if (process.env.SIMULATE === "1") {
        await page.evaluate(() => {
          if (document.querySelector(".cky-consent-container:not(.cky-hide)")) return;
          const el = document.createElement("div");
          // The real classes: the globals.css rule keys on them, so a stand-in
          // with different ones would test nothing.
          el.className = "cky-consent-container cky-classic-bottom";
          el.style.cssText =
            "position:fixed;left:0;right:0;bottom:0;height:316px;z-index:9999999;background:#121212";
          document.body.appendChild(el);
        });
        await page.waitForTimeout(400);
      }

      if (process.env.MUTATE === "1") {
        // Take the reserved space away again. A page that passes only because
        // of the globals.css rule must fail here, or this probe proves nothing.
        await page.addStyleTag({ content: "body { padding-bottom: 0 !important; }" });
        await page.waitForTimeout(300);
      }

      const plan = await page.evaluate(
        ({ sel, textSource, skipTop, pick }) => {
          const re = textSource ? new RegExp(textSource.source, textSource.flags) : null;

          // NOT offsetParent: it is null for any position:fixed element, and the
          // banner is fixed — that check reported "no banner on screen" for a
          // banner covering half the display.
          const onScreen = (e) => {
            const st = getComputedStyle(e);
            if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0)
              return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };

          const banner = [
            ...document.querySelectorAll(
              ".cky-consent-container, .cky-modal, [class*='cky-consent']"
            ),
          ].find((e) => onScreen(e) && e.getBoundingClientRect().height > 0);
          if (!banner) return { reason: "no consent banner on screen" };

          // Skip the sticky header's copy of the CTA: it sits where the banner
          // never reaches, so counting it would mask the hero CTA readers press.
          const matches = [...document.querySelectorAll(sel)].filter((e) => {
            if (!onScreen(e)) return false;
            if (skipTop && e.getBoundingClientRect().top + window.scrollY < skipTop) return false;
            return re ? re.test((e.innerText || "").trim()) : true;
          });
          const cta = pick === "last" ? matches[matches.length - 1] : matches[0];
          if (!cta) return { reason: "no primary CTA found" };

          // Tag it. A long page can match a DIFFERENT link once it scrolls — the
          // landing has a dozen "start the survey" links — and measuring one
          // element then hit-testing another produced three "moved out of
          // measurement" results that looked like a probe limitation.
          cta.setAttribute("data-probe-cta", "1");

          const r = cta.getBoundingClientRect();
          const docY = r.top + window.scrollY;
          const bannerTop = banner.getBoundingClientRect().top;
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

          const lo = Math.max(0, Math.ceil(docY + r.height - bannerTop));
          const hi = Math.min(docY, maxScroll);
          return {
            reachable: lo <= hi,
            needScroll: lo,
            maxScroll: Math.round(maxScroll),
            bannerH: Math.round(banner.getBoundingClientRect().height),
          };
        },
        {
          sel: spec.selector,
          textSource: spec.text ? { source: spec.text.source, flags: spec.text.flags } : null,
          skipTop: spec.skipTop ?? 0,
          pick: spec.pick ?? "first",
        }
      );

      if (plan.reason) {
        unmeasured += 1;
        console.log(`INCONCLUSIVE ${where} ${plan.reason}`);
        continue;
      }

      if (!plan.reachable) {
        trapped += 1;
        console.log(
          `FAIL  ${where} CTA can never clear the banner — needs ${plan.needScroll}px of scroll, ` +
            `page offers ${plan.maxScroll}px (banner ${plan.bannerH}px)`
        );
        continue;
      }

      /**
       * CONVERGE, do not scroll to a precomputed offset.
       *
       * The first version measured the CTA, computed a scroll offset, scrolled
       * there and hit-tested. That assumes the layout does not move between the
       * measurement and the scroll — and the landing page is 17,000px of lazily
       * loaded content, so it does. Three consecutive local runs wanted 172,
       * 172 and 197px for the same device and page, and CI failed with "still
       * covered after scrolling to 172px": the offset was stale by the time it
       * was used, not wrong when it was computed.
       *
       * Re-reading the position each step converges whatever reflows. Bounded,
       * because a page that never settles is a result in itself rather than a
       * loop to spin in.
       */
      const settled = await page.evaluate(async () => {
        const wait = () => new Promise((r) => setTimeout(r, 350));
        const cta = document.querySelector('[data-probe-cta="1"]');
        const banner = document.querySelector(
          ".cky-consent-container, .cky-modal, [class*='cky-consent']"
        );
        if (!cta || !banner) return { lost: true };
        for (let i = 0; i < 5; i += 1) {
          const c = cta.getBoundingClientRect();
          const top = banner.getBoundingClientRect().top;
          if (c.top >= 0 && c.bottom <= top) return { at: Math.round(window.scrollY) };
          // Move it just clear of the banner's top edge, or back into view.
          window.scrollBy(0, c.top < 0 ? c.top - 8 : c.bottom - top + 8);
          await wait();
        }
        return { at: Math.round(window.scrollY), unsettled: true };
      });
      if (settled.lost) {
        unmeasured += 1;
        console.log(`INCONCLUSIVE ${where} the CTA or the banner left the page while scrolling`);
        continue;
      }
      await page.waitForTimeout(250);
      const hit = await page.evaluate(() => {
        const cta = document.querySelector('[data-probe-cta="1"]');
        if (!cta) return { gone: true };
        const b = cta.getBoundingClientRect();
        if (b.bottom <= 0 || b.top >= window.innerHeight) return { offscreen: true };
        const blocked = [
          [0.5, 0.5],
          [0.15, 0.5],
          [0.85, 0.5],
          [0.5, 0.15],
          [0.5, 0.85],
        ].filter(([fx, fy]) => {
          const el = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
          return !(el && (el === cta || cta.contains(el)));
        }).length;
        return { blocked };
      });

      if (hit.gone || hit.offscreen) {
        // A long page can swap which element matches once it scrolls; that is
        // not evidence either way.
        unmeasured += 1;
        console.log(`INCONCLUSIVE ${where} CTA moved out of measurement after scrolling`);
      } else if (hit.blocked > 0) {
        trapped += 1;
        console.log(
          `FAIL  ${where} still covered at ${hit.blocked}/5 points at ${settled.at}px` +
            (settled.unsettled ? " (the page never settled)" : "")
        );
      } else {
        console.log(`PASS  ${where} reachable — clear at ${settled.at}px of scroll`);
      }
    } catch (err) {
      unmeasured += 1;
      console.log(`INCONCLUSIVE ${where} ${String(err.message).split("\n")[0].slice(0, 70)}`);
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
}

console.log("");
if (trapped > 0) {
  console.log(`FAIL (${trapped}) — a primary CTA cannot be reached past the consent banner`);
  process.exit(1);
}
if (unmeasured > 0) {
  console.log(`INCONCLUSIVE (${unmeasured}) — could not measure, not a pass`);
  process.exit(3);
}
console.log("PASS — every primary CTA can be brought clear of the consent banner");
