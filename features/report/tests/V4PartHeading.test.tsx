// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Report3PartHeading } from "@/data/report3-archetype-page";
import V4PartHeading from "@features/report/ui/v3/V4PartHeading";
import { installRevealObserver, mockRect, observerOf } from "./v4RevealTestKit";

/**
 * The V4 part heading (Figma 1:169 / 1:852 / 1:985) is drawn in a 361px column,
 * and its glow and two lines of type were placed at fixed lefts from that frame
 * (14 / 178.66 / 180.45). On a phone narrower than 393 the column shrinks — 288px
 * at 320 — and fixed lefts pushed the whole composition 36px right of centre.
 * Each is kept as the same offset from the centre instead: identical at 361,
 * centred on every phone.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

const rule = (selector: string) => {
  const at = V3_CSS.indexOf(selector);
  expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

describe("reportV3.css — the part heading stays centred on every phone", () => {
  it("places the glow from the centre, not the left edge (1:172: left 14 of 361)", () => {
    const css = rule(".rv3 .rv4-part__glow {");
    expect(css).toContain("left: calc(50% - 166.5px)");
    expect(css).not.toContain("left: 14px");
  });

  it("places the eyebrow and the title from the centre (1:173 / 1:174)", () => {
    // "Part" and its number are one group now, centred on the stage as every part's
    // frame centres it (29.09).
    expect(rule(".rv3 .rv4-part__eyebrow {")).toContain("left: 50%");
    expect(rule(".rv3 .rv4-part__title {")).toContain("left: calc(50% - 0.05px)");
  });

  // Review 25.09, Mark: "The gradient of the parts is cut off on the bottom, give it
  // more room." The 226px glow runs 44.6px past the 148px stage (1:172 at -33.39), and
  // the stage clipped it there, while its violet was still at 4%. Figma lets it spill
  // into the gap below; only the sides stay clipped, so a 320px phone cannot scroll.
  it("lets the glow fade out below the stage, clipping only its sides", () => {
    const stage = rule(".rv3 .rv4-part__stage {");
    expect(stage).toContain("overflow-x: clip;");
    expect(stage).toContain("overflow-y: visible;");
    expect(stage).not.toMatch(/\boverflow: clip;/);
  });

  // Final review, 25.09: spilling out of the stage, the glow lay over the first
  // chapter's head wherever nothing separates them (the 13 archetypes on V2 chapters),
  // and swallowed the taps on its title. It is decoration; it never takes a tap.
  it("never takes a tap from what lies under the glow", () => {
    expect(rule(".rv3 .rv4-part__glow {")).toContain("pointer-events: none;");
  });
});

// Our own extra, one of the two Fatih approved on 27.09 in answer to Mark's "maybe you
// also have some good ideas": each part's glow blooms in as its heading reaches the
// screen, on Report 2.0's own timings for its part dividers.
describe("V4PartHeading — the glow blooms in when the heading reaches the screen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const HEADING: Report3PartHeading = {
    eyebrow: "Part 5",
    number: "5",
    lead: "How you ",
    accent: "connect",
  };
  const part = (root: ParentNode) => root.querySelector(".rv4-part")!;

  it("holds the glow back until the heading is in view", () => {
    installRevealObserver();
    mockRect({ top: 5000 });
    const { container } = render(<V4PartHeading heading={HEADING} />);
    expect(part(container)).toHaveClass("is-pending");
    observerOf(part(container))!.fire(true);
    expect(part(container)).not.toHaveClass("is-pending");
  });

  it("opens at once on a heading already on screen", () => {
    installRevealObserver();
    mockRect({ top: 100 });
    const { container } = render(<V4PartHeading heading={HEADING} />);
    expect(part(container)).not.toHaveClass("is-pending");
  });

  it("hydrates the server-rendered preview without a mismatch", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const html = renderToString(<V4PartHeading heading={{ ...HEADING, tall: true }} />);
    expect(html).toContain("is-pending");
    installRevealObserver();
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(host, <V4PartHeading heading={{ ...HEADING, tall: true }} />);
    });
    expect(errors).not.toHaveBeenCalled();
    host.remove();
  });
});

/**
 * Mark, 29.09 (1945090190): "We reworked how we show the Part. Fonts have increased and
 * the font and color of the number has changed. Can you please standardise the padding
 * to the headline and space between "Part" and the number". Every part frame now sets
 * "Part" in 14px SemiBold #6b5b95 (Part 2's still 12), the number beside it in Lora Bold
 * in the brand gradient, and the headline in Lora 28/24. The frames place them apart
 * by 26 / 26 / 23 / 22 / 16 / 19px and 7 / 4 / 7 / 7 / 6 / 5px; one rule serves all six:
 * Part 3's (1:852, where the comment is pinned) 23 above the headline, 7 between.
 */
describe("V4PartHeading — 'Part' and its number (29.09)", () => {
  afterEach(cleanup);

  it("sets the word and the number as two runs, read as one", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    const { container } = render(<V4PartHeading heading={REPORT_V4_PARTS[2]!} />);
    const eyebrow = container.querySelector(".rv4-part__eyebrow")!;
    expect(eyebrow.querySelector(".rv4-part__word")!.textContent).toBe("Part");
    expect(eyebrow.querySelector(".rv4-part__num")!.textContent).toBe("3");
    expect(eyebrow.textContent).toBe("Part 3");
  });

  it("numbers the six parts 1 to 6, as the frames and the nav do", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    expect(REPORT_V4_PARTS.map((p) => p.number)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(REPORT_V4_PARTS.map((p) => p.eyebrow)).toEqual([
      "Part 1",
      "Part 2",
      "Part 3",
      "Part 4",
      "Part 5",
      "Part 6",
    ]);
    // 38:1515 — "How you connect", in lower case.
    expect(REPORT_V4_PARTS[4]!.lead).toBe("How you ");
  });

  it("sets Part 1's Welcome upright, in the near-black ink (1:174)", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    const { container } = render(<V4PartHeading heading={REPORT_V4_PARTS[0]!} lead />);
    expect(container.querySelector(".rv4-part__title")).toHaveClass("is-ink", "is-upright");
  });
});

describe("reportV3.css — the reworked Part (29.09)", () => {
  it("sets 'Part' 14/19.2 SemiBold #6b5b95, tracked 1.85, not in capitals", () => {
    const eyebrow = rule(".rv3 .rv4-part__eyebrow {");
    expect(eyebrow).toContain("color: var(--rv3-violet-ink)");
    expect(eyebrow).toContain("font-size: 14px");
    expect(eyebrow).toContain("font-weight: 600");
    expect(eyebrow).toContain("letter-spacing: 1.85px");
    expect(eyebrow).toContain("line-height: 19.2px");
    expect(eyebrow).not.toContain("uppercase");
    // The number sits on the word's baseline.
    expect(eyebrow).toContain("align-items: baseline");
  });

  it("sets the number in Lora Bold 14, in the brand gradient, 7px after the word", () => {
    const num = rule(".rv3 .rv4-part__num {");
    expect(num).toContain("font-family: var(--font-serif)");
    expect(num).toContain("font-weight: 700");
    expect(num).toContain("font-size: 14px");
    expect(num).toContain("margin-left: 7px");
    expect(num).toContain(
      "linear-gradient(175.03deg, #fb683e 17.123%, #e88c8c 44.722%, #ac88ed 108.39%)"
    );
    expect(num).toContain("background-clip: text");
    expect(num).toContain("color: transparent");
  });

  it("sets the headline in Lora 28/24 at -0.47, 23 under the Part row", () => {
    const title = rule(".rv3 .rv4-part__title {");
    expect(title).toContain("line-height: 24px");
    expect(title).toContain("letter-spacing: -0.47px");
    expect(title).toContain("top: 80px");
    expect(rule(".rv3 .rv4-part__eyebrow {")).toContain("top: 57px");
    // 28px wherever it fits; Part 3's is 338 wide at 28, so a phone narrower than
    // Figma's 393 scales it with the column rather than clipping it.
    expect(title).toContain("font-size: min(28px, calc((100vw - 32px) * 28 / 344))");
  });

  it("keeps Part 1's Welcome upright", () => {
    expect(rule(".rv3 .rv4-part__title.is-upright > span:last-child {")).toContain(
      "font-style: normal"
    );
  });
});

describe("reportV3.css — the part glow's bloom (review 27.09)", () => {
  it("rises from 82% and clear, on Report 2.0's part-divider timings", () => {
    const moving = rule(".rv3 .rv4-part .rv4-part__glow {");
    expect(moving).toContain("opacity 1100ms ease-out");
    expect(moving).toContain("transform 1500ms cubic-bezier(0.22, 1, 0.36, 1)");
    const pending = rule(".rv3 .rv4-part.is-pending .rv4-part__glow {");
    expect(pending).toContain("opacity: 0");
    expect(pending).toContain("transform: scale(0.82)");
  });

  it("keeps the 185 box's glow centred while it blooms: its transform carries translateX(-50%)", () => {
    expect(rule(".rv3 .rv4-part--tall.is-pending .rv4-part__glow {")).toContain(
      "transform: translateX(-50%) scale(0.82)"
    );
    // The `scale` property composes outside the transform list: the glow would slide.
    expect(V3_CSS).not.toMatch(/\.rv4-part__glow[^{]*\{[^}]*\bscale:/);
  });

  it("shows the glow in full under reduced motion, the 185 box's still centred", () => {
    const media = rule(`@media (prefers-reduced-motion: reduce) {
  .rv3 .rv4-part .rv4-part__glow,`);
    expect(media).toContain("opacity: 1");
    expect(media).toContain("transition: none");
    const at = V3_CSS.indexOf("  .rv3 .rv4-part--tall.is-pending .rv4-part__glow {");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toContain("transform: translateX(-50%)");
  });
});

/**
 * The 01.10 sync (transcript 00:26:42), Sanjin: "Are we still doing part
 * introductions or did we ditch that?" The team's unified answer: ditch them and go
 * straight into the content. Figma followed: Parts III–VI's "Part + Introduction Text"
 * frames (1:852, 1:985, 38:1510, 1:1140) are now 185-tall boxes holding only "Part",
 * the number and the title, so the "[Part Introductory Text]" placeholder goes, and
 * the live page takes the 185 box for those four parts where it drew the 148 one.
 */
describe("V4PartHeading — no part introductions (sync 01.10)", () => {
  afterEach(cleanup);

  it("gives Parts III–VI the 185 box and Parts I–II the 148 stage", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    expect(REPORT_V4_PARTS.map((p) => Boolean(p.tall))).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("draws the 185 box with its title and no lede paragraph", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    const { container } = render(<V4PartHeading heading={REPORT_V4_PARTS[2]!} />);
    const part = container.querySelector(".rv4-part")!;
    expect(part).toHaveClass("rv4-part--tall");
    expect(part).toHaveAttribute("data-node-id", "1:852");
    expect(part.querySelectorAll("p")).toHaveLength(1);
    expect(part.textContent).toBe("Part 3How your archetype works");
  });

  it("keeps Part II on the 148 stage", async () => {
    const { REPORT_V4_PARTS } = await import("@/data/report3-archetype-page");
    const { container } = render(<V4PartHeading heading={REPORT_V4_PARTS[1]!} />);
    expect(container.querySelector(".rv4-part")).not.toHaveClass("rv4-part--tall");
  });

  it("sizes the 185 box in CSS and leaves no intro rule behind", () => {
    expect(rule(".rv3 .rv4-part--tall .rv4-part__stage {")).toContain("height: 185px");
    expect(V3_CSS).not.toContain("rv4-part__intro");
    expect(V3_CSS).not.toContain("rv4-part--intro");
  });
});
