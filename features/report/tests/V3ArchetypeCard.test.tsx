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
    // 43% of the 323px track is the 138.875px the frame draws.
    expect(fill?.style.width).toBe("43%");
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
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      const view = renderCard();
      const viewport = view.container.querySelector<HTMLElement>(".rv3-deck__viewport")!;
      // 22 + 4 x 268 + 3 x 12 + 69 = 1199 of track in a 359 viewport.
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
    // I15:847;11070:796 is a fixed 29px under an 8px pad: 24px of line and 5 below.
    // The peeking card draws the same box at 0.94.
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-focused .rv3-deck__value")).toMatch(
      /padding-bottom: 5px/
    );
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__value")).toMatch(
      /padding-bottom: 3\.26px/
    );
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
    expect(V3_CSS).not.toContain(
      ".rv3:is(.rv4, .rv4-doc) .rv3-deck__card.is-peeking .rv3-deck__labels"
    );
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

  // Mark, 28.09 (1943978820, "Changed font size here" / "Also added the 'What drives
  // your desire'"; 1943982885, "Width of text box was changed"). 15:831 is a 197px
  // column, 10 apart: the 45px head (label over sub-label), the value, the body.
  it("lays the core motivation panel out as 15:831's 197px column, 10px apart", () => {
    const panel = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive");
    expect(panel).toMatch(/gap: 10px/);
    expect(panel).toMatch(/height: auto/);
    expect(panel).toMatch(/min-height: 197px/);
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-labels")).toMatch(
      /align-self: stretch/
    );
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-label")).toMatch(/min-height: 23px/);
    const sub = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-sub");
    expect(sub).toMatch(/font-size: 12px/);
    expect(sub).toMatch(/line-height: 19\.2px/);
    const value = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-value");
    expect(value).toMatch(/font-size: 18px/);
    expect(value).toMatch(/padding-top: 0/);
    const body = v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-body");
    expect(body).toMatch(/margin: 0/);
    // 15:845 is 281 wide, 2px past the panel's padding at 393; it narrows below that.
    expect(body).toMatch(/width: min\(281px, calc\(100% \+ 2px\)\)/);
  });

  it("keeps the card at 15:815's 1031, the taller panel taken out of the bottom room", () => {
    expect(v4Rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch")).toMatch(/padding: 18px 0 30px/);
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
