/**
 * Turn a session's reported viewport into the devices a probe should drive.
 *
 * WHY THIS EXISTS. `runProbe()` passed two environment variables, and the only
 * session-derived one — `WIDTHS` — is read by exactly ONE gate probe. The other
 * thirteen ran their own hardcoded device lists, while the Slack verdict told
 * the team every result was measured "at the size this reader had". Twelve of
 * those thirteen already read a `DEVICES` variable; nobody was setting it.
 *
 * `sessionViewport()` has always returned `os` alongside the widths and the
 * caller discarded it. Between them they are enough to pick a real device.
 *
 * Nearest width within the OS family, rather than hand-written bands: the bands
 * would be a second place to keep in sync with Playwright's registry, and this
 * cannot name a device that does not exist.
 */
import { devices } from "playwright";

/**
 * Candidates, narrow to wide. Exported so a test can assert every name still
 * exists in Playwright's registry: `nearest()` skips an unknown name, which is
 * the safe behaviour but also a silent one — a typo would quietly shrink the
 * family to whatever was left rather than fail.
 */
export const FAMILIES = {
  ios: ["iPhone SE", "iPhone 15 Pro", "iPhone 14 Pro Max", "iPhone 17 Pro Max"],
  android: ["Galaxy S9+", "Pixel 9", "Pixel 7"],
  desktop: ["Desktop Chrome"],
};

/** A width at or above this is a desktop, whatever the OS string says. */
const DESKTOP_MIN_WIDTH = 900;

/** Registry width for a device name, or null when Playwright does not know it. */
function widthOf(name) {
  return devices[name]?.viewport?.width ?? null;
}

function familyFor(os, width) {
  if (width >= DESKTOP_MIN_WIDTH) return "desktop";
  return /ios|iphone|ipad|mac/i.test(String(os ?? "")) ? "ios" : "android";
}

/** The known device closest in width to `width`, within `family`. */
function nearest(family, width) {
  let best = null;
  let bestGap = Infinity;
  for (const name of FAMILIES[family]) {
    const w = widthOf(name);
    // A name Playwright has dropped is skipped rather than passed on to a probe,
    // where `devices[name]` would be undefined and the context silently wrong.
    if (w === null) continue;
    const gap = Math.abs(w - width);
    if (gap < bestGap) {
      best = name;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * `DEVICES` for a session, or null when the viewport is unknown — in which case
 * the caller must leave the probe on its own defaults rather than guess.
 *
 * Both ends of the range: the narrowest is where layout breaks, and the widest
 * catches a foldable that changed size mid-session (a Galaxy Z Flip moved
 * 262px to 715px inside one recording, which is why `sessionViewport` reports
 * min and max rather than an average).
 */
export function devicesForSession(viewport) {
  if (!viewport) return null;
  const widths = [viewport.min, viewport.max].filter(
    (w) => typeof w === "number" && Number.isFinite(w) && w >= 200 && w <= 2000
  );
  if (widths.length === 0) return null;

  const picked = [];
  for (const w of widths) {
    const name = nearest(familyFor(viewport.os, w), w);
    if (name && !picked.includes(name)) picked.push(name);
  }
  return picked.length > 0 ? picked.join(",") : null;
}
