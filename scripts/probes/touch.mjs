/**
 * Real finger input, not the programmatic kind.
 *
 * `locator.click()` scrolls the element into view, waits for "actionability" and
 * then dispatches a trusted click at its centre — it routes AROUND most of what
 * breaks for a real thumb. `window.scrollBy` is worse: a body with a stranded
 * scroll lock still reports the full scroll distance while no finger can move
 * the page at all (see the $dead_swipe incident).
 *
 * So: taps go through the touchscreen at real coordinates and hit whatever is
 * actually on top, and scrolling on Chromium is a CDP-synthesized touch gesture.
 *
 * WebKit exposes no CDP, so iOS scroll fidelity is the one gap — there we fall
 * back to a wheel and lean on the lock-state assertions, which catch the same
 * defect from the other side. Never report an iOS scroll as "verified by
 * gesture"; it is verified by state.
 */

export async function touchScroll(cdp, page, dy = 500, opts = {}) {
  const { x, y } = await page.evaluate(() => ({
    x: Math.floor(window.innerWidth / 2),
    y: Math.floor(window.innerHeight * 0.6),
  }));
  const before = await page.evaluate(() => window.scrollY);
  if (cdp) {
    await cdp.send("Input.synthesizeScrollGesture", {
      x,
      y,
      xDistance: 0,
      yDistance: -dy,
      gestureSourceType: "touch",
      speed: opts.speed ?? 1200,
      preventFling: opts.preventFling ?? true,
    });
  } else {
    // Mobile WebKit supports neither CDP nor mouse.wheel, so positioning falls
    // back to a programmatic scroll. This moves the page but proves NOTHING
    // about whether a finger could — a stranded body lock lets scrollBy through
    // untouched. Treat `real:false` rows as unverified for scrollability and
    // lean on the lock-state assertions instead.
    await page.evaluate((d) => window.scrollBy(0, d), dy);
  }
  await page.waitForTimeout(opts.settle ?? 450);
  const after = await page.evaluate(() => window.scrollY);
  return { before, after, moved: after - before, real: !!cdp };
}

/** Scroll with real gestures until the selector is on screen (or we give up). */
export async function touchScrollTo(cdp, page, selector, maxSwipes = 25) {
  for (let i = 0; i < maxSwipes; i += 1) {
    const pos = await page.evaluate((s) => {
      const n = document.querySelector(s);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { top: r.top, bottom: r.bottom, ih: window.innerHeight };
    }, selector);
    if (!pos) return { found: false, swipes: i };
    // fully inside the middle band of the viewport
    if (pos.top >= 8 && pos.bottom <= pos.ih - 8) return { found: true, swipes: i };
    const dy =
      pos.top > pos.ih - 8
        ? Math.min(600, pos.top - pos.ih / 2)
        : -Math.min(600, pos.ih / 2 - pos.top);
    const r = await touchScroll(cdp, page, dy);
    if (r.moved === 0 && i > 1) return { found: false, stuck: true, swipes: i };
  }
  return { found: false, swipes: maxSwipes };
}

/**
 * The height a finger can actually land on, which is not the element's box.
 *
 * A CSS hit-area expansion (an absolutely-positioned `::after`) enlarges what a
 * tap hits without changing `getBoundingClientRect()`, so measuring the box
 * would report a fix as absent. Pseudo-elements are not returned by
 * `elementFromPoint` — it returns the originating element — so scanning
 * outwards from the centre gives the true tappable extent.
 */
export async function hitAreaHeight(page, selector) {
  return page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    // Only the element itself or its descendants count. An ANCESTOR containing
    // the button must NOT count: tapping the surrounding bar does nothing, and
    // counting it inflated a 34px CTA to 61px on the first run of this check.
    const owns = (el) => !!el && (el === n || n.contains(el));
    if (!owns(document.elementFromPoint(cx, cy))) return { box: Math.round(r.height), hit: 0 };
    let up = 0;
    let down = 0;
    while (up < 40 && cy - up - 1 >= 0 && owns(document.elementFromPoint(cx, cy - up - 1))) up += 1;
    while (
      down < 40 &&
      cy + down + 1 <= window.innerHeight &&
      owns(document.elementFromPoint(cx, cy + down + 1))
    )
      down += 1;
    return { box: Math.round(r.height), hit: up + down + 1 };
  }, selector);
}

/**
 * Tap where a finger would land, and report what actually received it.
 * Returns `{ tapped, hitTarget, blockedBy }` — `tapped:false` means a real user
 * could not have hit this element from where it is.
 */
export async function realTap(page, selector, { cdp = null, scroll = true } = {}) {
  if (scroll) await touchScrollTo(cdp, page, selector);
  const probe = await page.evaluate((s) => {
    const n = document.querySelector(s);
    if (!n) return { exists: false };
    const r = n.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { exists: true, visible: false };
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const onScreen = cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth;
    const top = onScreen ? document.elementFromPoint(cx, cy) : null;
    return {
      exists: true,
      visible: true,
      onScreen,
      cx,
      cy,
      reaches: !!top && (top === n || n.contains(top) || top.contains(n)),
      topEl: top ? `${top.tagName}.${String(top.className || "").split(" ")[0]}` : null,
      blockedByConsent: !!(top && top.closest && top.closest("[class*='cky']")),
      size: { w: Math.round(r.width), h: Math.round(r.height) },
    };
  }, selector);

  if (!probe.exists || !probe.visible || !probe.onScreen) return { tapped: false, ...probe };
  await page.touchscreen.tap(probe.cx, probe.cy);
  return { tapped: probe.reaches, ...probe };
}
