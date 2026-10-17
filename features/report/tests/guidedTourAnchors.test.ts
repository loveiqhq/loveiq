// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { findTourAnchor, isShown } from "@features/report/ui/v3/guidedTourAnchors";

/**
 * What each stop of the guided tour points at (Figma 1755:1858, 1766:3637, 1766:4108,
 * 1766:5050, 1767:1512), found in the page as the report renders it.
 */

function sized(el: Element | null, w = 100, h = 30) {
  if (!el) throw new Error("missing element");
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: 0, left: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }),
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the tour's controls", () => {
  it("counts only an element with a box, outside anything hidden", () => {
    document.body.innerHTML = `<div hidden><button id="a"></button></div><button id="b"></button><button id="c"></button>`;
    sized(document.getElementById("a"));
    sized(document.getElementById("b"));
    sized(document.getElementById("c"), 0, 0);
    expect(isShown(document.getElementById("a"))).toBe(false);
    expect(isShown(document.getElementById("b"))).toBe(true);
    expect(isShown(document.getElementById("c"))).toBe(false);
  });

  it("takes the phone's pill for the menu, and the desktop's sidebar where the pill is hidden", () => {
    document.body.innerHTML = `
      <div class="report-chapter-pill"><button class="report-chapter-pill__btn"></button></div>
      <aside><nav class="report-sidebar__nav"></nav></aside>`;
    const pill = document.querySelector(".report-chapter-pill__btn");
    const nav = document.querySelector(".report-sidebar__nav");
    sized(pill);
    sized(nav, 240, 600);
    expect(findTourAnchor("chapter_menu")).toEqual({ el: pill, sidebar: false });
    sized(pill, 0, 0); // `xl:hidden` from 1280px
    expect(findTourAnchor("chapter_menu")).toEqual({ el: nav, sidebar: true });
  });

  it("never takes the drawer's own pill for the menu", () => {
    document.body.innerHTML = `
      <div class="report-chapter-drawer-root"><button class="report-chapter-pill__btn"></button></div>`;
    sized(document.querySelector(".report-chapter-pill__btn"));
    expect(findTourAnchor("chapter_menu")).toBeNull();
  });

  it("takes Typical Beliefs' first Show All, then any other once that one is opened", () => {
    document.body.innerHTML = `
      <section id="core_archetype"><button class="rv4-fold__pill" id="before"></button></section>
      <section id="typical_beliefs"><div class="rv4-fold"><button class="rv4-fold__pill" id="tb"></button></div></section>
      <section id="accelerators"><button class="rv4-fold__pill" id="after"></button></section>`;
    ["before", "tb", "after"].forEach((id) => sized(document.getElementById(id)));
    expect(findTourAnchor("show_all")?.el.id).toBe("tb");
    document.getElementById("tb")!.remove();
    expect(findTourAnchor("show_all")?.el.id).toBe("before");
  });

  it("takes Typical Beliefs' chevron disc and the words of its practice header", () => {
    document.body.innerHTML = `
      <section id="typical_beliefs">
        <button class="rv4-chapter__button"><span class="rv4-chapter__chev"></span></button>
        <section class="rv4-try"><button class="rv4-try__button"><span class="rv4-try__label"></span><span class="rv4-try__chev"></span></button></section>
      </section>`;
    sized(document.querySelector(".rv4-chapter__chev"), 34, 34);
    sized(document.querySelector(".rv4-try__label"), 260, 32);
    expect(findTourAnchor("chapter_toggle")?.el.className).toBe("rv4-chapter__chev");
    expect(findTourAnchor("try_this")?.el.className).toBe("rv4-try__label");
  });

  it("takes the lock of the first locked chapter after Typical Beliefs, not a badge inside it", () => {
    document.body.innerHTML = `
      <main>
        <section id="typical_beliefs" class="rv4-chapter is-open"><span class="rv4-chapter__lock" id="inside"></span></section>
        <section id="power_orientation" class="rv4-chapter is-locked"><span class="rv4-chapter__lock" id="power"></span></section>
        <section id="libido" class="rv4-chapter is-locked"><span class="rv4-chapter__lock" id="libido-lock"></span></section>
      </main>`;
    ["inside", "power", "libido-lock"].forEach((id) => sized(document.getElementById(id)));
    expect(findTourAnchor("unlock")?.el.id).toBe("power");
  });

  it("finds no unlock on a page with no locked chapter", () => {
    document.body.innerHTML = `<main><section id="typical_beliefs" class="rv4-chapter"></section></main>`;
    expect(findTourAnchor("unlock")).toBeNull();
  });
});
