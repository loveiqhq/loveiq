// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4PremiumCard from "@features/report/ui/v3/V4PremiumCard";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import V4TryThis from "@features/report/ui/v3/V4TryThis";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * The floating "Premium content" card comes in two copies. The article and the
 * practice gates draw 153:2301 ("14-day money-back guarantee" / "No questions
 * asked."); the chapter-body gates draw 348:373 and 314:309 ("14-day money-back" /
 * "Guaranteed, no questions asked."). Fatih's call, 2026-09-23: build each gate as
 * its frame draws it.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");

afterEach(cleanup);

describe("V4PremiumCard", () => {
  it("draws the article card by default", () => {
    const { container } = render(<V4PremiumCard />);
    const card = container.querySelector(".rv4-premium")!;
    expect(card.getAttribute("data-node-id")).toBe("153:2301");
    expect(card.classList.contains("rv4-premium--guarantee")).toBe(false);
    expect(screen.getByText("14-day money-back guarantee")).toBeTruthy();
    expect(screen.getByText("No questions asked.")).toBeTruthy();
  });

  it("draws the chapter-body copy as the guarantee variant", () => {
    const { container } = render(<V4PremiumCard variant="guarantee" />);
    const card = container.querySelector(".rv4-premium")!;
    expect(card.classList.contains("rv4-premium--guarantee")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("314:309");
    expect(screen.getByText("14-day money-back")).toBeTruthy();
    expect(screen.getByText("Guaranteed, no questions asked.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock full report" })).toBeTruthy();
  });

  it("takes the frame's node id when a chapter names its own", () => {
    const { container } = render(<V4PremiumCard variant="guarantee" nodeId="348:373" />);
    expect(container.querySelector(".rv4-premium")!.getAttribute("data-node-id")).toBe("348:373");
  });
});

describe("where each variant goes", () => {
  it("puts the guarantee card on Typical Beliefs' body gate (348:373), as its frame draws it", () => {
    const { container } = render(
      <V4TypicalBeliefs view={buildTypicalBeliefs("Spark Seeker", { locked: true })!} />
    );
    const card = container.querySelector(".rv4-tb__gate .rv4-premium")!;
    expect(card.classList.contains("rv4-premium--guarantee")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("348:373");
  });

  it("keeps the article card on the practice gate (374:280)", () => {
    const { container } = render(
      <V4TryThis
        practice={buildTypicalBeliefs("Spark Seeker", { locked: true })!.practice}
        defaultOpen
      />
    );
    const card = container.querySelector(".rv4-try__rest .rv4-premium")!;
    expect(card.classList.contains("rv4-premium--guarantee")).toBe(false);
  });
});

describe("reportV3.css — the guarantee variant", () => {
  const rule = (selector: string) => {
    const at = V3_CSS.indexOf(selector);
    expect(at, `${selector} missing from reportV3.css`).toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("sets the heading line at 314:326's 14/22.4", () => {
    const css = rule(".rv3 .rv4-premium--guarantee .rv4-premium__guarantee-head {");
    expect(css).toContain("font-size: 14px");
    expect(css).toContain("line-height: 22.4px");
  });

  it("draws 314:321's taller tick", () => {
    expect(rule(".rv3 .rv4-premium--guarantee .rv4-premium__shield-tick {")).toContain(
      "height: 14.625px"
    );
  });
});

/**
 * Every Premium card frame — 153:2301, 348:373, 314:309 — renders its 0.719px stroke
 * in a gradient style ("Logo Gradient Temporary") that the export flattens to its
 * #fe6839 fallback: orange on the left, pink across the top, violet down the right.
 * The card is a 0.719x scale of the V2 paywall card (8005:735), whose border is that
 * gradient, so the same paint is laid over the base rule.
 */
describe("reportV3.css — the card's gradient stroke", () => {
  const strokeRule = () => {
    const at = V3_CSS.indexOf(".rv3 .rv4-premium {", V3_CSS.indexOf("Premium card — the stroke"));
    expect(at, "the stroke block is missing").toBeGreaterThan(-1);
    return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
  };

  it("paints the border as 8005:735's orange-to-violet gradient", () => {
    const css = strokeRule();
    expect(css).toContain("border-color: transparent;");
    expect(css).toContain("linear-gradient(#fff, #fff) padding-box");
    expect(css).toContain(
      "linear-gradient(120deg, #fe6839 0%, #c167cf 52%, #8887f6 100%) border-box"
    );
  });
});

/**
 * Where the frames put the card's contents (153:2301 / 314:309, card-relative).
 * The guarantee box and the button share one frame (153:2308 / 314:316) spaced
 * 11.512 apart — the card's own 15 only separates the heading from that frame.
 * Figma's strokes are inside and its text boxes round up (19.2 → 20, 22.4 → 23,
 * 28.8 → 29), so the button lands at 148.35 (article) / 151.35 (chapter body).
 */
describe("V4PremiumCard — the offer frame (153:2308 / 314:316)", () => {
  it("groups the guarantee box and the button", () => {
    const { container } = render(<V4PremiumCard variant="guarantee" />);
    const offer = container.querySelector(".rv4-premium > .rv4-premium__offer")!;
    expect([...offer.children].map((c) => c.className)).toEqual([
      "rv4-premium__guarantee",
      "rv4-premium__cta",
    ]);
  });

  it("spaces them as the frame does, with its strokes inside and its text boxes whole", () => {
    const rule = (selector: string, from = 0) => {
      const at = V3_CSS.indexOf(selector, from);
      expect(at, `${selector} missing`).toBeGreaterThan(-1);
      return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
    };
    const from = V3_CSS.indexOf("Premium card — the stroke");
    expect(rule(".rv3 .rv4-premium {", from)).toContain("padding: 14.39px 31.657px 0;");
    expect(rule(".rv3 .rv4-premium__head {", from)).toContain("min-height: 29px;");
    expect(rule(".rv3 .rv4-premium__offer {", from)).toContain("gap: 11.512px;");
    const box = rule(".rv3 .rv4-premium__guarantee {", from);
    expect(box).toContain("padding-top: 20.146px;");
    expect(box).toContain("padding-bottom: 20.146px;");
    expect(rule(".rv3 .rv4-premium__guarantee-head {", from)).toContain("min-height: 20px;");
    expect(rule(".rv3 .rv4-premium--guarantee .rv4-premium__guarantee-head {", from)).toContain(
      "min-height: 23px;"
    );
  });

  it("draws the button without the glow no frame renders", () => {
    // 153:2321 / 314:329 carry a shadow on a transparent layer, and all three card
    // frames render nothing under the button — while the badge's glow does render.
    const from = V3_CSS.indexOf("Premium card — the stroke");
    const at = V3_CSS.indexOf(".rv3 .rv4-premium__cta {", from);
    expect(at, "the button rule is missing").toBeGreaterThan(-1);
    expect(V3_CSS.slice(at, V3_CSS.indexOf("}", at))).toContain("box-shadow: none;");
  });
});
