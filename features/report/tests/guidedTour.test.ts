import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ANCHOR_AT,
  AUTO_START_SCROLL_LIMIT,
  BUBBLE_GAP,
  BUBBLE_MAX_WIDTH,
  CONSENT_GRACE_MS,
  GUIDED_TOUR_KEY,
  HOLE_PAD,
  TOUR_STEP_IDS,
  bubbleWidth,
  consentSettled,
  easeInOutQuad,
  guidedTourKey,
  hasConsentDecision,
  holeFor,
  lerpHole,
  placeBubble,
  scrimPath,
  scrollDurationMs,
  scrollTargetFor,
  stepMotion,
  tourRuledOut,
  tourSteps,
  tourTooLate,
  tourWaitingOn,
} from "@features/report/logic/guidedTour";

/**
 * The guided tour's rules (Figma 1713:1071 › 1755:1275, Ready for Dev 16.10; Mark's
 * prototype, tab "Guided tour"). The numbers here are the spec card's (1755:1276) and the
 * Tour / Step component's (1754:1404).
 */

describe("the tour's stops", () => {
  it("runs menu, Show All, chapter toggle, Try This, then the unlock, in reading order", () => {
    expect(TOUR_STEP_IDS).toEqual([
      "chapter_menu",
      "show_all",
      "chapter_toggle",
      "try_this",
      "unlock",
    ]);
  });

  it("gives a reader who has not paid five stops and anyone who paid four", () => {
    expect(tourSteps({ includeUnlock: true })).toHaveLength(5);
    expect(tourSteps({ includeUnlock: false })).toEqual([
      "chapter_menu",
      "show_all",
      "chapter_toggle",
      "try_this",
    ]);
  });

  it("starts at the very top, where the menu is, and lands every other stop mid-screen", () => {
    expect(stepMotion("chapter_menu", { sidebar: false }).toTop).toBe(true);
    for (const id of TOUR_STEP_IDS.slice(1)) {
      expect(stepMotion(id, { sidebar: false }).toTop, id).toBe(false);
    }
  });

  it("puts the menu's bubble under the phone's pill, and beside a desktop's sidebar", () => {
    expect(stepMotion("chapter_menu", { sidebar: false })).toMatchObject({
      prefer: "below",
      gesture: "nudge",
    });
    expect(stepMotion("chapter_menu", { sidebar: true })).toMatchObject({
      prefer: "right",
      gesture: null,
    });
  });

  it("keeps each stop's gesture: shimmer, chevron turn, none for Try This, shimmer on Unlock", () => {
    expect(stepMotion("show_all", { sidebar: false }).gesture).toBe("shimmer");
    expect(stepMotion("chapter_toggle", { sidebar: false }).gesture).toBe("turn");
    expect(stepMotion("try_this", { sidebar: false }).gesture).toBeNull();
    expect(stepMotion("unlock", { sidebar: false })).toMatchObject({
      prefer: "above",
      gesture: "shimmer",
    });
  });
});

describe("the tour's motion", () => {
  it("eases in and out", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(0.5)).toBe(0.5);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(0.25)).toBeLessThan(0.25);
    expect(easeInOutQuad(0.75)).toBeGreaterThan(0.75);
  });

  it("scrolls quickly for a short hop and never longer than 0.7s", () => {
    expect(scrollDurationMs(1)).toBe(0);
    expect(scrollDurationMs(100)).toBe(292);
    expect(scrollDurationMs(-100)).toBe(292);
    expect(scrollDurationMs(5_000)).toBe(700);
  });

  it("rests the control's centre 42% down the visible screen", () => {
    const target = scrollTargetFor({
      anchor: { top: 1_000, height: 40 },
      scrollY: 2_000,
      view: { top: 0, height: 800 },
      maxScroll: 50_000,
    });
    // After scrolling to `target`, the centre (1020 in the viewport now) sits at 0.42 * 800.
    expect(2_000 + 1_020 - target).toBe(Math.round(800 * ANCHOR_AT));
  });

  it("measures 42% of the screen above the cookie banner when one covers the bottom", () => {
    const withBanner = scrollTargetFor({
      anchor: { top: 900, height: 0 },
      scrollY: 0,
      view: { top: 0, height: 500 },
      maxScroll: 50_000,
    });
    expect(withBanner).toBe(900 - 210);
  });

  it("stops at the page's ends", () => {
    const view = { top: 0, height: 800 };
    expect(
      scrollTargetFor({ anchor: { top: 50, height: 20 }, scrollY: 0, view, maxScroll: 9_000 })
    ).toBe(0);
    expect(
      scrollTargetFor({ anchor: { top: 900, height: 20 }, scrollY: 8_900, view, maxScroll: 9_000 })
    ).toBe(9_000);
  });
});

describe("the spotlight", () => {
  it("opens the hole 6px round the control", () => {
    const hole = holeFor({ x: 100, y: 200, w: 120, h: 30 }, 8);
    expect(HOLE_PAD).toBe(6);
    expect(hole).toMatchObject({ x: 94, y: 194, w: 132, h: 42, r: 14 });
  });

  it("softens a square control's hole to the prototype's 16", () => {
    expect(holeFor({ x: 0, y: 0, w: 200, h: 60 }, 0).r).toBe(16);
    expect(holeFor({ x: 0, y: 0, w: 200, h: 60 }, Number.NaN).r).toBe(16);
  });

  it("keeps a pill a pill and a disc a disc", () => {
    const pill = holeFor({ x: 0, y: 0, w: 120, h: 34 }, 999);
    expect(pill.r).toBe(pill.h / 2);
    const disc = holeFor({ x: 0, y: 0, w: 34, h: 34 }, 17);
    expect(disc.r).toBe(disc.w / 2);
  });

  it("travels from one hole to the next", () => {
    const from = { x: 0, y: 0, w: 10, h: 10, r: 2 };
    const to = { x: 100, y: 200, w: 30, h: 50, r: 10 };
    expect(lerpHole(from, to, 0)).toEqual(from);
    expect(lerpHole(from, to, 1)).toEqual(to);
    expect(lerpHole(from, to, 0.5)).toEqual({ x: 50, y: 100, w: 20, h: 30, r: 6 });
  });

  it("draws the dim as the screen alone before the first stop", () => {
    expect(scrimPath(393, 852, null)).toBe("M0 0H393V852H0Z");
  });

  it("draws the dim as the screen minus one rounded hole", () => {
    const d = scrimPath(393, 852, { x: 10, y: 20, w: 100, h: 40, r: 20 });
    expect(d.startsWith("M0 0H393V852H0Z")).toBe(true);
    // The hole: starts after the top-left corner and turns four rounded corners.
    expect(d).toContain("M30 20H90");
    expect(d.match(/A20 20 0 0 1/g)).toHaveLength(4);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("the bubble", () => {
  const size = { w: 292, h: 145 };
  const phone = { width: 393, top: 0, bottom: 852 };

  it("is 292 wide, or the screen less 16px a side", () => {
    expect(BUBBLE_MAX_WIDTH).toBe(292);
    expect(bubbleWidth(393)).toBe(292);
    expect(bubbleWidth(320)).toBe(288);
  });

  it("sits below a control in the top half, the arrow on the control's centre", () => {
    const hole = holeFor({ x: 50, y: 80, w: 291, h: 56 }, 999);
    const placed = placeBubble({ hole, size, view: phone, prefer: null });
    expect(placed.placement).toBe("below");
    expect(placed.top).toBe(hole.y + hole.h + BUBBLE_GAP);
    const centre = hole.x + hole.w / 2;
    expect(placed.left + placed.arrow + 8).toBeCloseTo(centre, 5);
  });

  it("sits above a control in the bottom half", () => {
    const hole = holeFor({ x: 120, y: 600, w: 150, h: 36 }, 999);
    const placed = placeBubble({ hole, size, view: phone, prefer: null });
    expect(placed.placement).toBe("above");
    expect(placed.top + size.h + BUBBLE_GAP).toBe(hole.y);
  });

  it("takes the side a stop prefers when it has room, and the other when it has not", () => {
    const midway = holeFor({ x: 300, y: 340, w: 70, h: 60 }, 0);
    expect(placeBubble({ hole: midway, size, view: phone, prefer: "above" }).placement).toBe(
      "above"
    );
    const nearTop = holeFor({ x: 300, y: 60, w: 70, h: 60 }, 0);
    expect(placeBubble({ hole: nearTop, size, view: phone, prefer: "above" }).placement).toBe(
      "below"
    );
  });

  it("stays inside the screen's sides, the arrow clear of its corners", () => {
    const atRightEdge = holeFor({ x: 340, y: 200, w: 34, h: 34 }, 17);
    const placed = placeBubble({ hole: atRightEdge, size, view: phone, prefer: null });
    expect(placed.left).toBe(393 - 16 - size.w);
    expect(placed.arrow).toBeLessThanOrEqual(size.w - 14 - 16);
    const atLeftEdge = holeFor({ x: 4, y: 200, w: 20, h: 20 }, 0);
    const left = placeBubble({ hole: atLeftEdge, size, view: phone, prefer: null });
    expect(left.left).toBe(16);
    expect(left.arrow).toBeGreaterThanOrEqual(14);
  });

  it("keeps its buttons on screen even when neither side has room", () => {
    const tall = holeFor({ x: 20, y: 30, w: 350, h: 760 }, 0);
    const placed = placeBubble({ hole: tall, size, view: phone, prefer: null });
    expect(placed.top).toBeGreaterThanOrEqual(12);
    expect(placed.top + size.h).toBeLessThanOrEqual(852 - 12);
  });

  it("sits to the right of a desktop's sidebar, pointing at its top", () => {
    const sidebar = holeFor({ x: 24, y: 96, w: 240, h: 600 }, 0);
    const desktop = { width: 1440, top: 0, bottom: 789 };
    const placed = placeBubble({ hole: sidebar, size, view: desktop, prefer: "right" });
    expect(placed.placement).toBe("right");
    expect(placed.left).toBe(sidebar.x + sidebar.w + BUBBLE_GAP);
    expect(placed.top).toBeLessThan(sidebar.y + 40);
  });

  it("falls back under the control when there is no room to the right", () => {
    const wide = holeFor({ x: 24, y: 96, w: 300, h: 40 }, 0);
    const placed = placeBubble({ hole: wide, size, view: phone, prefer: "right" });
    expect(placed.placement).toBe("below");
  });
});

describe("when the tour starts by itself", () => {
  it("only on a loaded V4 report its owner (or a preview) is reading, once", () => {
    expect(tourRuledOut({ enabled: false, autoStart: true, seen: false })).toBe("disabled");
    expect(tourRuledOut({ enabled: true, autoStart: false, seen: false })).toBe("not_auto");
    expect(tourRuledOut({ enabled: true, autoStart: true, seen: true })).toBe("seen");
    expect(tourRuledOut({ enabled: true, autoStart: true, seen: false })).toBeNull();
  });

  it("waits for anything open, a hidden tab, the cookie answer and its controls, in that order", () => {
    const clear = { overlay: null, hidden: false, consentSettled: true, anchorsReady: true };
    expect(tourWaitingOn(clear)).toBeNull();
    expect(tourWaitingOn({ ...clear, overlay: "dialog", hidden: true })).toBe("overlay");
    expect(tourWaitingOn({ ...clear, hidden: true, consentSettled: false })).toBe("hidden");
    expect(tourWaitingOn({ ...clear, consentSettled: false, anchorsReady: false })).toBe("consent");
    expect(tourWaitingOn({ ...clear, anchorsReady: false })).toBe("anchors");
  });

  it("is remembered per report, a preview's under its own name", () => {
    // Marcus, 20.10: once per browser kept it off a reader's next report.
    expect(guidedTourKey(3011)).toBe(`${GUIDED_TOUR_KEY}:3011`);
    expect(guidedTourKey(2063)).not.toBe(guidedTourKey(3011));
    expect(guidedTourKey(null)).toBe(`${GUIDED_TOUR_KEY}:preview`);
  });

  it("is remembered under the key the e2e specs seed, so theirs never meet it", () => {
    const fixture = readFileSync("e2e/fixtures/report.ts", "utf8");
    expect(fixture).toContain(`GUIDED_TOUR_KEY = "${GUIDED_TOUR_KEY}"`);
    expect(fixture).toContain('`${GUIDED_TOUR_KEY}:${submissionId ?? "preview"}`');
  });

  it("gives way to a reader who already started scrolling", () => {
    expect(AUTO_START_SCROLL_LIMIT).toBe(100);
    expect(tourTooLate(0)).toBe(false);
    expect(tourTooLate(100)).toBe(false);
    expect(tourTooLate(101)).toBe(true);
  });
});

describe("the cookie question", () => {
  it("reads CookieYes's own record of an answer", () => {
    const answered =
      "a=1; cookieyes-consent=consentid:abc,consent:yes,action:yes,necessary:yes,analytics:no; b=2";
    expect(hasConsentDecision(answered)).toBe(true);
    expect(
      hasConsentDecision("cookieyes-consent=consentid:abc,consent:no,action:,necessary:yes")
    ).toBe(false);
    expect(hasConsentDecision("other=1")).toBe(false);
    expect(hasConsentDecision("")).toBe(false);
    expect(hasConsentDecision(undefined)).toBe(false);
  });

  it("reads an encoded value too", () => {
    expect(
      hasConsentDecision(`cookieyes-consent=${encodeURIComponent("consent:yes,action:yes")}`)
    ).toBe(true);
  });

  it("is settled once answered, or once CookieYes has had time to show its banner", () => {
    expect(consentSettled({ cookieHeader: "cookieyes-consent=action:yes", sinceLoadMs: 0 })).toBe(
      true
    );
    expect(consentSettled({ cookieHeader: "", sinceLoadMs: CONSENT_GRACE_MS - 1 })).toBe(false);
    expect(consentSettled({ cookieHeader: "", sinceLoadMs: CONSENT_GRACE_MS })).toBe(true);
  });
});
