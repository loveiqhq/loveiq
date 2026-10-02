// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { REPORT_V4_REWARD_INTRO } from "@/data/report3-archetype-page";
import RewardSection from "@features/report/ui/sections/RewardSection";

// Review 02.10, Mark (Notion, mobile unlocked): Report 2.0's phone card (Figma 8632:1455)
// opens on two lines before the ranked list: "The four currencies sexual chemistry can pay
// in — and how your system weighs each." / "This ranking differs sharply between
// archetypes." The desktop card (8427:1758) has none, so the stylesheet hides it from 700px.
const copy = { locked: false, takeaway: "A verdict.", stat1: null, "stat1.caption": null };
const config = {
  order: ["dopamine", "adrenaline", "oxytocin", "endorphins"],
  roles: ["lead", "support", "amplifier", "settler"],
  meters: [88, 56, 30, 12],
};
const props = {
  archetype: "Spark Seeker",
  config,
  onUnlock: () => {},
  sectionTitle: "Reward System",
};

describe("Reward System — Report 2.0's intro in the card (V4)", () => {
  afterEach(() => cleanup());
  it("is the two lines of 8632:1455", () => {
    expect(REPORT_V4_REWARD_INTRO).toEqual([
      "The four currencies sexual chemistry can pay in — and how your system weighs each.",
      "This ranking differs sharply between archetypes.",
    ]);
  });

  it("opens the unlocked card, the two lines a break apart", () => {
    const { container } = render(
      <RewardSection {...props} copy={copy} intro={REPORT_V4_REWARD_INTRO} />
    );
    const card = container.querySelector(".report-reward__card")!;
    const intro = card.querySelector(".report-reward__intro");
    expect(intro).not.toBeNull();
    expect(card.firstElementChild).toBe(intro);
    expect(intro!.querySelectorAll("br")).toHaveLength(1);
    expect(intro!.textContent).toBe(REPORT_V4_REWARD_INTRO.join(""));
  });

  it("is not drawn without the prop (Report 2.0 itself, ?v2=1)", () => {
    const { container } = render(<RewardSection {...props} copy={copy} />);
    expect(container.querySelector(".report-reward__intro")).toBeNull();
  });

  it("is never drawn on the locked stand-in", () => {
    const { container } = render(
      <RewardSection
        {...props}
        config={null}
        copy={{ ...copy, locked: true }}
        intro={REPORT_V4_REWARD_INTRO}
      />
    );
    expect(container.querySelector(".report-reward__intro")).toBeNull();
  });

  it("is passed by the page on V4 only", () => {
    const page = readFileSync(join(__dirname, "..", "ui", "ReportPage.tsx"), "utf8");
    expect(page).toContain("intro={isV4 ? REPORT_V4_REWARD_INTRO : undefined}");
  });

  it("is set as 2.0's phone intro and hidden from 700px", () => {
    const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    const phone =
      /@media \(max-width: 699px\) \{[\s\S]*?\.rv3\.rv4 \.report-reward__intro \{([^}]*)\}/.exec(
        css
      );
    expect(phone, "phone rule").not.toBeNull();
    expect(phone![1]).toMatch(/font-size:\s*14\.5px/);
    expect(phone![1]).toMatch(/color:\s*#6b6678/);
    expect(css).toMatch(
      /@media \(min-width: 700px\) \{\s*\.rv3\.rv4 \.report-reward__intro \{\s*display:\s*none;/
    );
  });
});
