/**
 * Does the survey open for a browser that refuses storage?
 *
 * Safari private mode and several in-app WebViews throw SecurityError on every
 * storage access. Errors are attributed by STACK, never by message: "The
 * operation is insecure." names no library, and that exact error turned out to
 * be Microsoft Clarity's on a previous investigation.
 *
 *   BREAK=session|local|both  which storage throws (default both)
 */
import { chromium, devices } from "playwright";
import { stagingCookies } from "./staging-cookie.mjs";

const ORIGIN = process.env.REPORT_ORIGIN ?? "https://www.loveiq.org";
const BREAK = process.env.BREAK ?? "both";
const THIRD_PARTY =
  /clarity|posthog|cookieyes|googletag|doubleclick|gstatic|google|facebook|tiktok/i;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "en-US" });
// A locally built server has STAGING_PASSWORD set, so every route is gated —
// without this the probe measures the login page, not the survey.
await ctx.addCookies(stagingCookies(ORIGIN)).catch(() => {});
const page = await ctx.newPage();

await page.addInitScript((which) => {
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  const dead = {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    get length() {
      return boom();
    },
  };
  if (which === "session" || which === "both") {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => dead });
  }
  if (which === "local" || which === "both") {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => dead });
  }
}, BREAK);

// Decisive attribution: an error with an EMPTY stack cannot be attributed by
// reading it, so block the third-party scripts and see what remains. Anything
// still thrown is ours.
if (process.env.BLOCK_THIRD_PARTY === "1") {
  await page.route("**/*", (route) => {
    const u = route.request().url();
    return THIRD_PARTY.test(u) && !u.includes("loveiq.org") ? route.abort() : route.continue();
  });
}

const errors = [];
page.on("pageerror", (e) => errors.push({ msg: String(e.message), stack: String(e.stack || "") }));

await page.goto(`${ORIGIN}/survey`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForTimeout(3500);
await page
  .locator(".cky-btn-accept")
  .first()
  .click({ timeout: 8000 })
  .catch(() => {});
// The survey mounts client-side; wait for a real control rather than a timer.
const rendered = await page
  .waitForFunction(
    () =>
      // The survey opens on an intro screen; its CTA is the signal, and the
      // CookieYes buttons must not be mistaken for it.
      [...document.querySelectorAll("button, a")].some(
        (b) =>
          /next|start|begin|let.s go|continue|discover/i.test(b.textContent || "") &&
          !b.className.includes("cky")
      ),
    undefined,
    { timeout: 25_000 }
  )
  .then(() => true)
  .catch(() => false);

// The intro screen renders BEFORE the survey engine mounts, and it is the
// engine (via usePartialSave -> getSessionId) that touches storage. Testing the
// intro proves nothing — click through to a real question.
let reachedQuestion = false;
// There is a multi-slide intro with a "Skip Intro" fast path — take it.
const skip = page
  .locator("button, a")
  .filter({ hasText: /skip intro/i })
  .first();
if (await skip.count()) {
  await skip.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
}
for (let i = 0; i < 12 && !reachedQuestion; i += 1) {
  reachedQuestion = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      /^next$/i.test((b.textContent || "").trim())
    )
  );
  if (reachedQuestion) break;
  const cta = page
    .locator("button, a")
    .filter({ hasText: /continue|start|begin|let.s go|discover/i })
    .filter({ hasNotText: /cookie|accept|reject|customise/i })
    .first();
  if (await cta.count()) {
    await cta.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2200);
  }
  reachedQuestion = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      /^next$/i.test((b.textContent || "").trim())
    )
  );
}
console.log(`  reached a real survey question (Next button present): ${reachedQuestion}`);

const state = await page.evaluate(() => {
  const txt = document.body.innerText || "";
  return {
    bodyChars: txt.trim().length,
    errorScreen: /something went wrong|unexpected error|could not|went wrong/i.test(txt),
    stagingGate: /enter staging site/i.test(txt),
    buttons: [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim().slice(0, 22))
      .slice(0, 8),
    heading: (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 70),
  };
});

const ours = errors.filter((e) => !THIRD_PARTY.test(e.stack) && !THIRD_PARTY.test(e.msg));
console.log(`storage broken: ${BREAK}`);
console.log(
  `  survey rendered a control: ${rendered}  bodyChars=${state.bodyChars}  errorScreen=${state.errorScreen}`
);
console.log(`  heading: "${state.heading}"`);
console.log(`  buttons: ${JSON.stringify(state.buttons)}`);
console.log(`  pageerrors: ${errors.length} total, ${ours.length} from OUR code`);
for (const e of errors) {
  const who = THIRD_PARTY.test(e.stack) || THIRD_PARTY.test(e.msg) ? "third-party" : "OURS";
  const top = e.stack.split("\n").slice(0, 3).join(" | ").replace(/\s+/g, " ").slice(0, 190);
  console.log(`    [${who}] ${e.msg.slice(0, 60)} :: ${top}`);
}
if (state.stagingGate) {
  console.log("  !! measured the STAGING LOGIN PAGE, not the survey — result void");
}
const ok =
  rendered && reachedQuestion && !state.errorScreen && !state.stagingGate && ours.length === 0;
console.log(
  ok ? "PASS: survey opens with storage refused" : "FAIL: survey does not open with storage refused"
);
await ctx.close();
await browser.close();
process.exitCode = ok ? 0 : 1;
