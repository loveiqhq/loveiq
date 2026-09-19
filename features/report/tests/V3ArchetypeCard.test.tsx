// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
    expect(container.querySelectorAll(".rv3-deck__card")).toHaveLength(4);
    expect(container.querySelectorAll(".rv3-deck__card.is-focused")).toHaveLength(1);
    expect(container.querySelectorAll(".rv3-deck__card.is-peeking")).toHaveLength(3);
  });

  it("opens on the requested dimension", () => {
    const { container } = renderCard(2);
    const focused = container.querySelector(".rv3-deck__card.is-focused");
    expect(focused?.getAttribute("data-dimension")).toBe("attachment");
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
    expect(V3_CSS).toMatch(/\.rv3-deck__card \{[^}]*scroll-snap-align: start/);
    expect(container.querySelectorAll("[data-deck-card]")).toHaveLength(4);
  });

  it("shows the chapter link on peeking cards only", () => {
    const { container } = renderCard();
    // 15:1175 is hidden="true" on the focused card in every variant frame.
    expect(container.querySelectorAll(".rv3-deck__more")).toHaveLength(3);
    expect(container.querySelector(".rv3-deck__card.is-focused .rv3-deck__more")).toBeNull();
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

  it("stops the deck animating under prefers-reduced-motion", () => {
    // Match the block that actually names the deck rather than the last one in the
    // file: reportV3.css has several reduced-motion blocks and gains more as the V4
    // page lands, so "the last one" is not a stable way to find this rule.
    const blocks = V3_CSS.split("@media (prefers-reduced-motion: reduce)").slice(1);
    const deckBlock = blocks.find((b) => b.includes(".rv3-deck__track"));
    expect(deckBlock, "no reduced-motion block mentions .rv3-deck__track").toBeDefined();
    expect(deckBlock).toContain("transition: none");
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

  it("points every chapter link at a dimension the report actually has", () => {
    expect(copy.dimensions.map((d) => d.chapterId)).toEqual([
      "love_language",
      "initiation_style",
      "attachment_style",
      "power_orientation",
    ]);
  });
});
