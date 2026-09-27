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
    expect(rule(".rv3 .rv4-part__eyebrow {")).toContain("left: calc(50% - 1.84px)");
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

  const HEADING: Report3PartHeading = { eyebrow: "Part V", lead: "How You", accent: "connect" };
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
    const html = renderToString(
      <V4PartHeading heading={HEADING} intro="[Part Introductory Text]" />
    );
    expect(html).toContain("is-pending");
    installRevealObserver();
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(host, <V4PartHeading heading={HEADING} intro="[Part Introductory Text]" />);
    });
    expect(errors).not.toHaveBeenCalled();
    host.remove();
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

  it("keeps the intro glow centred while it blooms: its transform carries translateX(-50%)", () => {
    expect(rule(".rv3 .rv4-part--intro.is-pending .rv4-part__glow {")).toContain(
      "transform: translateX(-50%) scale(0.82)"
    );
    // The `scale` property composes outside the transform list: the glow would slide.
    expect(V3_CSS).not.toMatch(/\.rv4-part__glow[^{]*\{[^}]*\bscale:/);
  });

  it("shows the glow in full under reduced motion, the intro one still centred", () => {
    const media = rule(`@media (prefers-reduced-motion: reduce) {
  .rv3 .rv4-part .rv4-part__glow,`);
    expect(media).toContain("opacity: 1");
    expect(media).toContain("transition: none");
    const at = V3_CSS.indexOf("  .rv3 .rv4-part--intro.is-pending .rv4-part__glow {");
    expect(at).toBeGreaterThan(0);
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toContain("transform: translateX(-50%)");
  });
});
