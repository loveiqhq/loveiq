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
