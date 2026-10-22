// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4Section from "@features/report/ui/v3/V4Section";

/**
 * A section's disc is not the chapter's (Mark, 22.10, on staging: "the toggles icons of the
 * paragraphs under the chapters [are] confusing, as they shouldnt be in the same styling.
 * Please check Figma again. They should be dotted and I made them a bit smaller").
 * Figma's section discs (1686:10514, 1954:4425 and their twins in the A&B and CiP frames):
 * 28px, white, a 1.5px inside ring of 1px dashes and gaps in the violet at 20%, and the
 * chevron pointing down while the section is open.
 */
const CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

/** The declarations of one exact selector, as written in the stylesheet. */
function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

afterEach(cleanup);

describe("the section disc (Mark, 22.10)", () => {
  it("draws a dotted ring in the violet at 20%, inside a 28px disc", () => {
    const { container } = render(<V4Section title="Common Challenges">Body</V4Section>);
    const ring = container.querySelector(".rv4-sect__chev .rv4-sect__ring circle")!;
    expect(ring.getAttribute("stroke-dasharray")).toBe("1 1");
    expect(ring.getAttribute("stroke-opacity")).toBe("0.2");
    expect(ring.getAttribute("stroke-width")).toBe("1.5");
    // Inside the 28px box, as Figma's INSIDE stroke: its middle runs 0.75px in.
    expect(ring.getAttribute("r")).toBe("13.25");
    const disc = rule(".rv3 .rv4-sect__chev");
    expect(disc).toMatch(/height: 28px/);
    expect(disc).toMatch(/width: 28px/);
    expect(disc).toMatch(/background: #fff/);
  });

  it("is not the chapter's: no lavender fill and no solid ring in either state", () => {
    expect(rule(".rv3 .rv4-sect__chev")).not.toMatch(/rgba\(121, 95, 200, 0\.1\)/);
    expect(CSS).not.toMatch(/\.rv4-sect\.is-open \.rv4-sect__chev \{[^}]*box-shadow/);
  });

  it("points down while the section is open and up once it is shut", () => {
    expect(CSS).not.toMatch(/\.rv4-sect\.is-open \.rv4-sect__chev svg[^{]*\{[^}]*rotate/);
    expect(rule(".rv3 .rv4-sect:not(.is-open) .rv4-sect__chev svg:not(.rv4-sect__ring)")).toMatch(
      /transform: rotate\(180deg\)/
    );
    const { container } = render(<V4Section title="Common Challenges">Body</V4Section>);
    const section = container.querySelector(".rv4-sect")!;
    expect(section).toHaveClass("is-open");
    fireEvent.click(container.querySelector(".rv4-sect__head")!);
    expect(section).not.toHaveClass("is-open");
  });
});
