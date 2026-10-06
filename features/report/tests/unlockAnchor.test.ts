// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const restoreScroll = vi.fn();
const openV4Chapter = vi.fn();
const resize = vi.fn();
vi.mock("@shared/ui/restore-scroll", () => ({ restoreScroll: (y: number) => restoreScroll(y) }));
vi.mock("@shared/ui/smooth-scroll-registry", () => ({ getSmoothScroll: () => ({ resize }) }));
vi.mock("@features/report/ui/v3/v4OpenChapter", () => ({
  openV4Chapter: (id: string) => openV4Chapter(id),
}));

import {
  captureUnlockAnchor,
  parseUnlockAnchor,
  restoreUnlockAnchor,
  serializeUnlockAnchor,
} from "@features/report/ui/unlockAnchor";

/** Pin an element's on-screen box; jsdom lays nothing out. */
function at(el: Element, top: number, height: number) {
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
}

/** Two chapters; the second holds two "Learn more" articles, the first of them open. */
function page() {
  document.body.innerHTML = `
    <section id="snapshot" data-report-section><p>…</p></section>
    <section id="desire_drivers" data-report-section>
      <article class="rv4-learn is-open"><button class="rv4-learn__button">a</button><div class="gate">locked</div></article>
      <article class="rv4-learn"><button class="rv4-learn__button">b</button></article>
    </section>`;
  const [snapshot, desire] = Array.from(document.querySelectorAll("section"));
  const [first, second] = Array.from(document.querySelectorAll("article"));
  return { snapshot: snapshot!, desire: desire!, first: first!, second: second! };
}

describe("unlock anchor — back to where the reader paid (Figma 1382:2010)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("round-trips through the URL form, and refuses anything else", () => {
    const anchor = { sectionId: "desire_drivers", article: 1, offset: -40, y: 320 };
    expect(serializeUnlockAnchor(anchor)).toBe("desire_drivers~1~-40~320");
    expect(parseUnlockAnchor("desire_drivers~1~-40~320")).toEqual(anchor);
    expect(parseUnlockAnchor("snapshot~~12~200")).toEqual({
      sectionId: "snapshot",
      article: null,
      offset: 12,
      y: 200,
    });
    for (const bad of [null, "", "x", "a~1~2", "<b>~1~2~3", "a~1~2~3~4", "a~123~0~0"]) {
      expect(parseUnlockAnchor(bad), String(bad)).toBeNull();
    }
    // An id that cannot travel safely is dropped, not mangled.
    expect(serializeUnlockAnchor({ sectionId: "a b", article: null, offset: 0, y: 0 })).toBeNull();
  });

  it("holds a tapped gate relative to its article, not to the page", () => {
    const { desire, first } = page();
    at(desire, -900, 3000);
    at(first, 200, 1200);
    const gate = first.querySelector(".gate")!;
    at(gate, 640, 40);
    expect(captureUnlockAnchor(gate)).toEqual({
      sectionId: "desire_drivers",
      article: 0,
      offset: 440,
      y: 640,
    });
  });

  it("falls back to the line being read when the paywall opened by itself", () => {
    const { snapshot, desire, second } = page();
    at(snapshot, -1200, 1000);
    at(desire, -200, 2400);
    at(second, 100, 600);
    // The reading line is a quarter of the way down: 200px of 800.
    expect(captureUnlockAnchor(null)).toEqual({
      sectionId: "desire_drivers",
      article: 1,
      offset: 100,
      y: 200,
    });
  });

  it("reopens the chapter and the article, then scrolls the spot back to its height", () => {
    const { desire, second } = page();
    const click = vi.spyOn(second.querySelector("button")!, "click");
    vi.stubGlobal("scrollY", 5000);
    at(desire, 300, 2400);
    at(second, 900, 600);

    restoreUnlockAnchor({ sectionId: "desire_drivers", article: 1, offset: 100, y: 200 });
    expect(openV4Chapter).toHaveBeenCalledWith("desire_drivers");
    expect(restoreScroll).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(click).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalled();
    // 5000 + 900 + 100 - 200
    expect(restoreScroll).toHaveBeenCalledWith(5800);
  });

  it("leaves the page alone when the chapter is not in this view", () => {
    page();
    const done = vi.fn();
    restoreUnlockAnchor({ sectionId: "gone", article: null, offset: 0, y: 0 }, done);
    vi.advanceTimersByTime(450);
    expect(restoreScroll).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
  });
});
