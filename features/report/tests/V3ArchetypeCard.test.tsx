// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V3ArchetypeCard from "@features/report/ui/v3/V3ArchetypeCard";
import { missingReport3CardCopy, report3ArchetypeCard } from "@/data/report3-archetype-card";

/**
 * Report V4 archetype card + dimension deck — Figma 15:815 / 15:194.
 *
 * Mirrors V3ChapterHeadings.test.tsx: assert the rendered DOM, and assert the CSS
 * contracts that the DOM alone cannot prove, by reading reportV3.css off disk.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const copy = report3ArchetypeCard["Spark Seeker"];
if (!copy) throw new Error("Spark Seeker card copy is required by these tests");

const renderCard = (initialDeckIndex = 0) =>
  render(
    <V3ArchetypeCard
      archetype="Spark Seeker"
      matchStrength={43}
      copy={copy}
      initialDeckIndex={initialDeckIndex}
    />
  );

afterEach(cleanup);

describe("V3ArchetypeCard", () => {
  it("renders the archetype, the match strength and the tagline", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Spark Seeker" })).toBeInTheDocument();
    expect(screen.getByText("Match Strength")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText(copy.tagline)).toBeInTheDocument();
  });

  it("fills the match bar to the match strength, not to a hardcoded width", () => {
    const { container } = renderCard();
    const fill = container.querySelector<HTMLElement>(".rv3-arch__bar-fill");
    // 43% of the 323px track is the 138.875px the frame draws. A custom property, not an
    // inline width, so the entrance can hold the bar at 0 (v4ArchetypeCardMotion2809).
    expect(fill?.style.getPropertyValue("--rv3-arch-match")).toBe("43%");
    expect(V3_CSS).toMatch(/\.rv3 \.rv3-arch__bar-fill \{[^}]*width: var\(--rv3-arch-match\)/);
  });

  it("takes its palette from archetypePresentation, so it is not Spark-Seeker-only", () => {
    const { container } = renderCard();
    const card = container.querySelector<HTMLElement>(".rv3-arch");
    // archetypePresentation["Spark Seeker"].iconBg / .dotColor — the frame's
    // #ff6a3d chip and #f97316 meter-gradient end.
    expect(card?.style.getPropertyValue("--rv3-arch-accent")).toBe("#ff6a3d");
    expect(card?.style.getPropertyValue("--rv3-arch-deep")).toBe("#f97316");
  });

  it("fills one meter segment per step and highlights only the reached label", () => {
    const { container } = renderCard();
    // Spark Seeker is high on both meters: 3 of 3 segments, twice.
    expect(container.querySelectorAll(".rv3-arch__seg")).toHaveLength(6);
    expect(container.querySelectorAll(".rv3-arch__seg.is-on")).toHaveLength(6);
    expect(container.querySelectorAll(".rv3-arch__stop.is-current")).toHaveLength(2);
    for (const stop of container.querySelectorAll(".rv3-arch__stop.is-current")) {
      expect(stop.textContent).toBe("High");
    }
  });

  it("heads core motivation with its label over 'What drives your desire', the value below", () => {
    const { container } = renderCard();
    const labels = container.querySelector(".rv3-arch__motive-labels");
    expect(labels?.querySelector(".rv3-arch__motive-label")?.textContent).toBe("Core motivation");
    expect(labels?.querySelector(".rv3-arch__motive-sub")?.textContent).toBe(
      "What drives your desire"
    );
    // 15:843 left the labels for a row of its own under the head (15:832).
    expect(labels?.querySelector(".rv3-arch__motive-value")).toBeNull();
    const head = container.querySelector(".rv3-arch__motive-head");
    const value = container.querySelector(".rv3-arch__motive-value");
    expect(value?.textContent).toBe(copy.coreMotivation.value);
    expect(head?.nextElementSibling).toBe(value);
    expect(value?.nextElementSibling?.className).toBe("rv3-arch__motive-body");
  });

  it("does not build the frames' hidden sub-trees (15:848, 15:966, 15:967)", () => {
    const { container } = renderCard();
    // Those carry hidden="true" in Figma; the only spacers are the three real ones.
    expect(container.querySelector(".rv3-arch__gap-15")).toBeInTheDocument();
    expect(container.querySelector(".rv3-arch__gap-26")).toBeInTheDocument();
    expect(container.querySelector(".rv3-arch__gap-14")).toBeInTheDocument();
  });
});

describe("V3DimensionDeck", () => {
  it("renders all four dimensions with exactly one focused", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll(".rv3-deck__slot")).toHaveLength(4);
    expect(container.querySelectorAll(".rv3-deck__slot.is-focused")).toHaveLength(1);
    expect(container.querySelectorAll(".rv3-deck__slot.is-peeking")).toHaveLength(3);
  });

  it("opens on the requested dimension", () => {
    const { container } = renderCard(2);
    const focused = container.querySelector(".rv3-deck__slot.is-focused");
    expect(focused?.getAttribute("data-dimension")).toBe("attachment");
  });

  // Review 24.09: "on the Spark Seeker card in the core Archetype, the swipe is
  // lagging, from communication - initiation - attachment -power". The focused design
  // used to arrive only once a swipe had SETTLED (scrollend, or 120ms of quiet on
  // Safari) and then morph its box for 260ms, animating width, height and inset.
  it("lays out both designs in every slot, so a swap is a cross-fade, not a re-layout", () => {
    const { container } = renderCard();
    const slots = container.querySelectorAll(".rv3-deck__slot");
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.querySelectorAll(":scope > .rv3-deck__card.is-focused")).toHaveLength(1);
      const peek = slot.querySelectorAll(":scope > .rv3-deck__card.is-peeking");
      expect(peek).toHaveLength(1);
      // The same words twice; assistive tech hears them once.
      expect(peek[0]!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  describe("while a swipe is travelling", () => {
    const setup = () => {
      // Synchronous, for the deck's scroll handler. A frame asked for from inside a
      // frame is dropped: the match strength's count-up asks for its next one there, and
      // a real frame is never synchronous, so run in place it would never return.
      let inFrame = false;
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        if (inFrame) return 1;
        inFrame = true;
        try {
          cb(0);
        } finally {
          inFrame = false;
        }
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      const view = renderCard();
      const viewport = view.container.querySelector<HTMLElement>(".rv3-deck__viewport")!;
      // 22 + 4 x 266 + 3 x 14 + 71 = 1199 of track in a 359 viewport (the trailing space
      // is 359 - 288, so Power reaches the snap edge at 840).
      Object.defineProperty(viewport, "scrollWidth", { value: 1199, configurable: true });
      Object.defineProperty(viewport, "clientWidth", { value: 359, configurable: true });
      const scrollTo = (left: number) => {
        viewport.scrollLeft = left;
        fireEvent.scroll(viewport);
      };
      const focused = () =>
        view.container.querySelector(".rv3-deck__slot.is-focused")?.getAttribute("data-dimension");
      return { scrollTo, focused };
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("hands focus to the arriving card before the swipe lands", () => {
      const { scrollTo, focused } = setup();
      scrollTo(196); // 70% of the way from Communication to Initiation, still moving
      expect(focused()).toBe("initiation");
      scrollTo(476); // 70% on to Attachment
      expect(focused()).toBe("attachment");
      scrollTo(840); // the end of the track: Power
      expect(focused()).toBe("power");
    });

    it("does not flicker when a finger hovers around the midpoint", () => {
      const { scrollTo, focused } = setup();
      scrollTo(154); // 55%: not yet
      expect(focused()).toBe("communication");
      scrollTo(182); // 65%: Initiation
      expect(focused()).toBe("initiation");
      scrollTo(126); // back to 45%: still Initiation
      expect(focused()).toBe("initiation");
      scrollTo(98); // 35%: back to Communication
      expect(focused()).toBe("communication");
    });
  });

  it("is a native scroller, so a trackpad moves it like the other decks", () => {
    const { container } = renderCard();
    // The frames encode the states as `left: -280px x index`; that is the geometry,
    // not the mechanism. Snapping 22px in is what puts a card where each frame
    // draws it, and the trailing padding is what lets the last one get there.
    expect(V3_CSS).toMatch(/\.rv3-deck__viewport \{[^}]*overflow-x: auto/);
    expect(V3_CSS).toMatch(/\.rv3-deck__viewport \{[^}]*scroll-snap-type: x mandatory/);
    expect(V3_CSS).toMatch(/\.rv3-deck__viewport \{[^}]*scroll-padding-inline-start: 22px/);
    expect(V3_CSS).toMatch(/\.rv3-deck__track \{[^}]*padding: 14px 69px 6px 22px/);
    expect(V3_CSS).toMatch(/\.rv3-deck__slot \{[^}]*scroll-snap-align: start/);
    expect(container.querySelectorAll("[data-deck-card]")).toHaveLength(4);
  });

  it("draws no 'Learn more in chapter' link on any card", () => {
    const { container } = renderCard();
    // Removed 2026-09-23: every card ends on its body and blank space, as the
    // deck components (15:1136 / 15:1236 / 15:1336) draw them.
    expect(container.querySelectorAll(".rv3-deck__more")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/learn more in chapter/i);
  });

  it("marks the active indicator bar and gives every bar an accessible name", () => {
    const { container } = renderCard(1);
    const dots = container.querySelectorAll(".rv3-deck__dot");
    expect(dots).toHaveLength(4);
    expect(container.querySelectorAll(".rv3-deck__dot.is-active")).toHaveLength(1);
    expect(dots[1]?.className).toContain("is-active");
    expect(screen.getByRole("button", { name: "Show Power" })).toBeInTheDocument();
  });
});

// Sanjin, desktop review 30.09 (Notion): Attachment "jumps over", the deck is hard to
// flip, and "the lines" are hard to click. From about 720px the phone's 69px of trailing
// space left Attachment's snap past the end of the scroll, so its line's scrollTo clamped
// to Power; at 1536 Initiation went too. Every card reaches the snap edge now, and from
// 700px the indicator is the science gallery's pager: Previous and Next either side of
// the four bars, drawn as dots (useSciPager, measured off the deck's slots).
describe("V3DimensionDeck — the pager (desktop review 30.09)", () => {
  /** A desktop deck `width` wide whose smooth scroll never lands: a glide in flight. */
  const setup = (width = 853) => {
    // Synchronous frames, as above; one asked for from inside a frame is dropped.
    let inFrame = false;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (inFrame) return 1;
      inFrame = true;
      try {
        cb(0);
      } finally {
        inFrame = false;
      }
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const view = renderCard();
    const viewport = view.container.querySelector<HTMLElement>(".rv3-deck__viewport")!;
    // Every card reaches the snap edge, so the scroll runs 840 past the viewport.
    Object.defineProperty(viewport, "clientWidth", { value: width, configurable: true });
    Object.defineProperty(viewport, "scrollWidth", { value: width + 840, configurable: true });
    // Slot i sits 280 x i along the track. jsdom reads no stylesheet, so the snap edge
    // is the viewport's own left edge here, not 22px in.
    view.container.querySelectorAll<HTMLElement>(".rv3-deck__slot").forEach((slot, i) => {
      slot.getBoundingClientRect = () =>
        ({ left: 280 * i - viewport.scrollLeft, width: 266 }) as DOMRect;
    });
    const glides: number[] = [];
    viewport.scrollTo = ((options: ScrollToOptions) => {
      glides.push(options.left ?? Number.NaN);
    }) as typeof viewport.scrollTo;
    const scrollTo = (left: number) => {
      viewport.scrollLeft = left;
      fireEvent.scroll(viewport);
    };
    const focused = () =>
      view.container.querySelector(".rv3-deck__slot.is-focused")?.getAttribute("data-dimension");
    const activeDot = () =>
      Array.from(view.container.querySelectorAll(".rv3-deck__dot")).findIndex((dot) =>
        dot.classList.contains("is-active")
      );
    const previous = () => screen.getByRole("button", { name: "Previous dimension" });
    const next = () => screen.getByRole("button", { name: "Next dimension" });
    return { viewport, glides, scrollTo, focused, activeDot, previous, next };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws Previous and Next either side of the four bars, in one labelled group", () => {
    const { previous, next } = setup();
    const group = screen.getByRole("group", { name: "Dimension cards" });
    expect(group.getAttribute("data-node-id")).toBe("15:1231");
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons).toHaveLength(6);
    expect(buttons[0]).toBe(previous());
    expect(buttons[5]).toBe(next());
    expect(buttons.slice(1, 5).every((b) => b.classList.contains("rv3-deck__dot"))).toBe(true);
    // Both name the scroller they move.
    const id = document.querySelector(".rv3-deck__viewport")!.id;
    expect(id).not.toBe("");
    expect(previous().getAttribute("aria-controls")).toBe(id);
    expect(next().getAttribute("aria-controls")).toBe(id);
  });

  it("steps one card on Next and focuses it at once, before the glide lands", () => {
    const { glides, focused, activeDot, next } = setup();
    fireEvent.click(next());
    expect(glides).toEqual([280]);
    expect(focused()).toBe("initiation");
    expect(activeDot()).toBe(1);
  });

  it("goes on from the card it is gliding to, so two quick clicks move two cards", () => {
    const { glides, focused, next } = setup();
    fireEvent.click(next());
    fireEvent.click(next());
    expect(glides).toEqual([280, 560]);
    expect(focused()).toBe("attachment");
  });

  it("reaches Attachment and Power, however wide the deck", () => {
    for (const width of [618, 853, 915]) {
      const { glides, focused, next } = setup(width);
      fireEvent.click(next());
      fireEvent.click(next());
      fireEvent.click(next());
      expect(glides, `at ${width}`).toEqual([280, 560, 840]);
      expect(focused(), `at ${width}`).toBe("power");
      cleanup();
    }
  });

  it("holds a clicked bar's card in focus while the deck glides past the others", () => {
    const { glides, scrollTo, focused, activeDot } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Show Power" }));
    expect(glides).toEqual([840]);
    expect(focused()).toBe("power");
    scrollTo(300); // passing Initiation
    expect(focused()).toBe("power");
    expect(activeDot()).toBe(3);
    scrollTo(840); // landed: the swipe's own reading takes over, and agrees
    expect(focused()).toBe("power");
  });

  it("lets focus follow the deck again once the reader takes over", () => {
    const { viewport, scrollTo, focused, next } = setup();
    fireEvent.click(next());
    expect(focused()).toBe("initiation");
    fireEvent.wheel(viewport);
    scrollTo(0);
    expect(focused()).toBe("communication");
  });

  it("marks Previous inert on the first card and Next on the last", () => {
    const { glides, previous, next } = setup();
    expect(previous().getAttribute("aria-disabled")).toBe("true");
    expect(next().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(previous());
    expect(glides).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Show Power" }));
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(previous().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(next());
    expect(glides).toEqual([840]);
  });
});

describe("reportV3.css contracts", () => {
  it("scales the peeking card to the frame's exact box, not a transform", () => {
    // A transform:scale would also shrink the type, but the frames set body 12px
    // against the focused card's 14px, so the two states are separate styles.
    expect(V3_CSS).toContain(".rv3 .rv3-deck__card.is-peeking .rv3-deck__inner");
    expect(V3_CSS).toMatch(/is-peeking \.rv3-deck__inner \{[^}]*opacity: 0\.62/);
    expect(V3_CSS).toMatch(/is-peeking \.rv3-deck__inner \{[^}]*width: 251\.92px/);
    expect(V3_CSS).not.toMatch(/rv3-deck__card[^{]*\{[^}]*transform: scale/);
  });

  it("paints the glyphs with a mask, because the exported SVGs hardcode a stroke", () => {
    expect(V3_CSS).toMatch(/\.rv3-deck__glyph \{[^}]*mask: var\(--rv3-deck-glyph\)/);
    expect(V3_CSS).toMatch(/-webkit-mask: var\(--rv3-deck-glyph\)/);
  });

  it("swaps a card's design on opacity alone, which the compositor runs by itself", () => {
    const block = (selector: string) => {
      const at = V3_CSS.indexOf(selector);
      expect(at, selector).toBeGreaterThan(-1);
      return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
    };
    const face = block(".rv3 .rv3-deck__card {");
    expect(face).toMatch(/position: absolute/);
    expect(face).toMatch(/transition: opacity 180ms ease/);
    expect(block(".rv3 .rv3-deck__inner {")).not.toMatch(/transition/);
    // A focused slot hides its peeking design and a peeking slot its focused one.
    expect(V3_CSS).toContain(".rv3 .rv3-deck__slot.is-focused > .rv3-deck__card.is-peeking,");
    const hidden = block(".rv3 .rv3-deck__slot.is-peeking > .rv3-deck__card.is-focused {");
    expect(hidden).toMatch(/opacity: 0/);
  });

  it("stops the deck animating under prefers-reduced-motion", () => {
    // Match the block that actually names the deck rather than the last one in the
    // file: reportV3.css has several reduced-motion blocks and gains more as the V4
    // page lands, so "the last one" is not a stable way to find this rule.
    // Match on the block's own first rule, not on "a chunk that mentions the deck
    // somewhere": the plain string split runs each chunk to the NEXT
    // reduced-motion block, so an earlier one sweeps up every ordinary
    // `.rv3-deck__*` rule that follows it and matches by accident.
    const blocks = V3_CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);
    const deckBlock = blocks.find((b) => b.slice(0, b.indexOf("}")).includes(".rv3-deck__track"));
    expect(deckBlock, "no reduced-motion block opens on .rv3-deck__track").toBeDefined();
    expect(deckBlock).toContain("transition: none");
    // The two designs cross-fade, so that has to stop here too.
    expect(deckBlock!.slice(0, deckBlock!.indexOf("}"))).toContain(".rv3-deck__card");
  });
});

describe("report3ArchetypeCard", () => {
  it("names the archetypes still missing card copy, rather than inventing it", () => {
    // Mirrors missingReport3Blurbs(): the gap closes loudly. Only Spark Seeker is
    // drawn in the frames, so only Spark Seeker is authored.
    const missing = missingReport3CardCopy();
    expect(missing).not.toContain("Spark Seeker");
    expect(missing).toHaveLength(13);
  });

  it("carries the supportive sentences Mark approved on 2026-09-23", () => {
    const body = (key: string) => copy.dimensions.find((d) => d.key === key)?.body;
    expect(body("initiation")).toBe(
      "You make the first move often, and the move itself is part of the pleasure. What matters most is feeling that your interest is met with genuine enthusiasm."
    );
    expect(body("attachment")).toBe(
      "Closeness is comfortable while it stays voluntary. When it starts to feel owed, you may begin to pull back or create some distance."
    );
  });
});

/**
 * Report V4 — the card as Figma 15:815 draws it today. Mark's 15.09 update ("icon size
 * of Core Motivation, spacing and structure of the headlines of the Communication etc.
 * cards") and the frame's own geometry, measured against the live page at 393.
 * `?v3=1` never renders this card (it shows V2's CoreArchetypeSection): these are V4's
 * overrides, appended below line 1884 for both V4 roots, the live report (`.rv4`) and
 * /report-v4-preview (`.rv4-doc`).
 */
describe("V4 archetype card — reportV3.css, both V4 roots", () => {
  const v4Rule = (selector: string) => {
    const needle = `${selector} {`;
    const at = V3_CSS.indexOf(needle);
    expect(at, `missing: ${needle}`).toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  // Mark, 28.09 (1943979946): "Changed font size". Both designs set it at 18 now.
  it("sets the deck card's headline in Lora 18/24 inside 15:847's 29px box", () => {
    const value = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__value");
    expect(value).toMatch(/font-size: 18px/);
    expect(value).toMatch(/line-height: 24px/);
    // 1116:1037 is a fixed 29px under an 8px pad: 24px of line and 5 below. Since 30.09
    // the peeking cards draw the same box, at full scale.
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__value")).toMatch(
      /padding-bottom: 5px/
    );
    const peekValue = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__value");
    expect(peekValue).toMatch(/padding: 8px 0 5px/);
    expect(peekValue).toMatch(/letter-spacing: -0\.5px/);
  });

  // Mark, 28.09 (1943979283): "Left Aligned now with Gap to the icon". The focused card's
  // labels start 10px after the chip (I15:847;11070:787); the peeking design keeps its own.
  it("left-aligns the focused card's labels 10px after the chip", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__head")).toMatch(
      /gap: 10px/
    );
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__labels")).toMatch(
      /align-items: flex-start/
    );
  });

  // Mark, 30.09 (1947975917): "The other Tiles (Communication, Initiation etc.)". The deck
  // was rebuilt from them (1116:1425): four 266x324 cards 14px apart (the same 280px
  // step), the peeking ones peach at 62% and at full scale, every chip gone for the bare
  // outline in the accent.
  it("rebuilds the deck from 1116:1425's tiles", () => {
    const slot = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__slot");
    expect(slot).toMatch(/height: 324px/);
    expect(slot).toMatch(/width: 266px/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__track")).toMatch(/gap: 14px/);
    const peek = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__inner");
    for (const want of [
      /background: var\(--rv3-peach\)/,
      /border: 1px solid rgba\(22, 16, 33, 0\.1\)/,
      /border-radius: 18px/,
      /gap: 5px/,
      /height: 100%/,
      /left: 0/,
      /opacity: 0\.62/,
      /padding: 18px/,
      /top: 0/,
      /width: 266px/,
    ]) {
      expect(peek).toMatch(want);
    }
    // 1116:1029 — a 26x45 box and no fill; the peeking cards set the icon bare.
    const chip = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__chip");
    expect(chip).toMatch(/background: none/);
    expect(chip).toMatch(/height: 45px/);
    expect(chip).toMatch(/width: 26px/);
    expect(chip).toMatch(/padding: 0/);
    const peekChip = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__chip");
    expect(peekChip).toMatch(/background: none/);
    expect(peekChip).toMatch(/padding: 0/);
    const glyph = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card .rv3-deck__glyph");
    expect(glyph).toMatch(/background: var\(--rv3-deck-accent\)/);
    expect(glyph).toMatch(/height: 23px/);
    expect(glyph).toMatch(/width: 23px/);
    // The 25.09 colour swap (a white glyph on the solid chip) has nothing left to swap.
    expect(V3_CSS).not.toMatch(
      /\.rv3:is\(\.rv4, \.rv4-doc\) \.rv3-deck__[^{]*\{\s*background-color: #fff/
    );
  });

  // Desktop review 30.09 (Sanjin: Attachment "jumps over"). Power's snap is 3 x 280 = 840,
  // and the track's content without its trailing space is 22 + 4 x 266 + 3 x 14 = 1128,
  // so the trailing space must be at least the viewport less 288 for the scroll to run to
  // 840. The phone's 69 was that for the old 268 card at 359; this is 71 there.
  it("lets every card reach the snap edge, however wide the deck", () => {
    const track = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__track");
    expect(track).toMatch(/padding-right: max\(69px, 100% - 288px\)/);
    for (const width of [300, 359, 618, 853, 915, 1200]) {
      const trailing = Math.max(69, width - 288);
      expect(22 + 4 * 266 + 3 * 14 + trailing - width, `at ${width}`).toBeGreaterThanOrEqual(840);
    }
  });

  // The pager's arrows exist on every width, for one set of indicator buttons; the phone
  // and the 393 preview keep the four lines and never draw them.
  it("hides the arrows everywhere the desktop block does not draw them", () => {
    const at = V3_CSS.indexOf(".rv3 .rv3-deck__arrow {");
    expect(at).toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    expect(at).toBeLessThan(V3_CSS.indexOf("Desktop touch-up — 28.09 (c)"));
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toMatch(/display: none/);
  });

  it("sets both designs' labels as 1116:1034 / 1116:1057: Medium 14 over ExtraLight 12, left", () => {
    const title = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card .rv3-deck__title");
    expect(title).toMatch(/font-size: 14px/);
    expect(title).toMatch(/font-weight: 500/);
    expect(title).toMatch(/letter-spacing: 0/);
    expect(title).toMatch(/text-transform: capitalize/);
    const sub = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card .rv3-deck__sub");
    expect(sub).toMatch(/font-size: 12px/);
    expect(sub).toMatch(/font-weight: 200/);
    expect(sub).toMatch(/text-transform: none/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__head")).toMatch(
      /gap: 10px/
    );
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__labels")).toMatch(
      /align-items: flex-start/
    );
    const body = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__body");
    expect(body).toMatch(/font-size: 14px/);
    expect(body).toMatch(/line-height: 22\.4px/);
    expect(body).toMatch(/padding: 11px 0 13\.5px/);
    expect(body).toMatch(/width: 230px/);
  });

  it("opens the focused card's sub-label with a capital, as 15:847 writes it", () => {
    // "How desire gets spoken"; the copy stays lower-case, as the peeking card sets it.
    expect(
      v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__sub::first-letter")
    ).toMatch(/text-transform: uppercase/);
  });

  it("holds the header at 15:816's fixed 191px, the match row taking the slack", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__head")).toMatch(/min-height: 191px/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__match")).toMatch(/flex-grow: 1/);
    // 15:828, the tagline's fixed 70px box.
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__tagline")).toMatch(/min-height: 70px/);
  });

  // Mark, 28.09 (1943978527): "Decreased Font size here". 15:829 is Lora 16/24.
  it("sets the tagline in Lora 16/24 inside 15:828's 70px box", () => {
    const tagline = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__tagline");
    expect(tagline).toMatch(/font-size: 16px/);
    expect(tagline).toMatch(/line-height: 24px/);
    expect(tagline).toMatch(/letter-spacing: 0/);
  });

  // Mark, 30.09 (1947975917): "We have update the Core Motivation card". 870:7166 is a
  // 220px panel, 10 apart: the head (the icon, with no chip now, 10px before its labels),
  // the value and the body.
  it("lays the core motivation panel out as 870:7166's 220px panel, 10px apart", () => {
    const panel = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive");
    expect(panel).toMatch(/gap: 10px/);
    expect(panel).toMatch(/height: auto/);
    expect(panel).toMatch(/min-height: 220px/);
    expect(panel).toMatch(/165\.7374deg/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-head")).toMatch(/gap: 10px/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-labels")).toMatch(
      /align-self: stretch/
    );
    const label = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-label");
    expect(label).toMatch(/min-height: 23px/);
    // 1107:2437 — Plus Jakarta Medium in grey/44, where it was ExtraLight.
    expect(label).toMatch(/font-weight: 500/);
    expect(label).toMatch(/color: var\(--rv3-muted\)/);
    const sub = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-sub");
    expect(sub).toMatch(/font-size: 12px/);
    expect(sub).toMatch(/line-height: 19\.2px/);
    const value = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-value");
    expect(value).toMatch(/font-size: 18px/);
    expect(value).toMatch(/padding-top: 0/);
    const body = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-body");
    expect(body).toMatch(/margin: 0/);
    // 870:7180 is 281 wide, 2px past the panel's padding at 393; it narrows below that.
    expect(body).toMatch(/width: min\(281px, calc\(100% \+ 2px\)\)/);
  });

  // 1107:2432 — the chip is gone: a 32x45 box holding the 26px target outline (1107:2430),
  // drawn in the archetype's accent through a mask of Mark's own glyph.
  it("draws the core motivation icon as the bare outline, in the accent", () => {
    const chip = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-chip");
    expect(chip).toMatch(/background: none/);
    expect(chip).toMatch(/height: 45px/);
    expect(chip).toMatch(/width: 32px/);
    expect(chip).toMatch(/padding: 0/);
    const glyph = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-glyph");
    expect(glyph).toMatch(/background: var\(--rv3-arch-accent\)/);
    expect(glyph).toMatch(/\/report\/v4\/dimensions\/core-motivation\.svg/);
    expect(glyph).toMatch(/width: 27\.3458px/);
  });

  it("keeps the card at 15:815's 1031, the taller panel taken out of the bottom room", () => {
    // 30.09: the 220px panel (23 more than 28.09's) comes out of the room under the
    // meters, which 15:815 now ends 8px above its foot.
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch")).toMatch(/padding: 18px 0 7px/);
  });

  // 1116:1025 clips at 360, under the page indicator (1116:1120 at 345), so the focused
  // card's shadow fades out behind the bars; a 345px track cut it 15px higher.
  it("lets the focused card's shadow run under the page indicator, as 1116:1025 clips it", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__viewport")).toMatch(/height: 360px/);
    const track = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__track");
    expect(track).toMatch(/height: 360px/);
    expect(track).toMatch(/padding-bottom: 22px/);
    const dots = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__dots");
    expect(dots).toMatch(/margin-top: -15px/);
    expect(dots).toMatch(/position: relative/);
  });

  it("keeps the frame's widths at 393 but narrows instead of clipping on smaller phones", () => {
    // At 360 the fixed 323px rows lost the end of "43%" and the tagline, and the deck's
    // last indicator bar; at 320 the core motivation body ran out of its panel. 100% + 8
    // is the frame's 323 at 393 (the head's 315 plus 8 into its right padding).
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__match")).toMatch(
      /width: min\(323px, calc\(100% \+ 8px\)\)/
    );
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__tagline")).toMatch(
      /width: min\(323px, calc\(100% \+ 8px\)\)/
    );
    for (const part of [
      ".rv3:is(.rv4, .rv4-doc) .rv3-deck",
      ".rv3:is(.rv4, .rv4-doc) .rv3-deck__viewport",
      ".rv3:is(.rv4, .rv4-doc) .rv3-deck__dots",
    ]) {
      expect(v4Rule(part)).toMatch(/width: 100%/);
    }
  });

  it("steps the two meters 77px apart, as 15:926's fixed 57px rows do", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__meters")).toMatch(/grid-auto-rows: 57px/);
    // 15:932: the bars row keeps its 7px under the 9px pad, so the scale stays put.
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__meter-bars")).toMatch(/min-height: 16px/);
  });

  // Mark, 28.09 (1943985000): "Decreased scale bars width/heigth". 15:933 and its
  // siblings are 104 x 4 now, the 7px fill clipped to 4; the 104 was already built.
  it("draws each meter bar 4px tall on its 104px track", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__seg")).toMatch(/height: 4px/);
    expect(V3_CSS).toMatch(
      /\.rv3 \.rv3-arch__meter-bars \{[^}]*gap: 10px[^}]*padding-inline: 8\.5px/
    );
  });
});
