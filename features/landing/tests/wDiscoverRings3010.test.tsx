// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WDiscover from "@features/landing/ui/white/WDiscover";

afterEach(cleanup);

/**
 * Mark, 30.10 (Slack): "we changed the icons and would need to change the icons also on the
 * other landing pages". The home page's "In 15 minutes" tiles are his ring icons since then:
 * an ink glyph on a soft tint in a thin brand-gradient ring, not filled with the buttons' gradient.
 */
describe("the home page's “In 15 minutes” tiles", () => {
  it("are Mark's rings, ink glyphs, nothing filled with the buttons' gradient", () => {
    const { container } = render(<WDiscover />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(4);
    for (const svg of svgs) {
      expect(svg.getAttribute("stroke")).toBe("#3a2a55");
      const tile = svg.parentElement as HTMLElement;
      expect(tile.getAttribute("style")).toContain("padding-box");
      expect(tile.getAttribute("style")).toContain("border-box");
      expect(tile.className).not.toContain("bg-gradient-to-br");
    }
  });
});
