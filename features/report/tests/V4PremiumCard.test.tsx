// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V4PremiumCard from "@features/report/ui/v3/V4PremiumCard";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import V4TryThis from "@features/report/ui/v3/V4TryThis";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

/**
 * Mark, 29.09 (1945959774 / 1945959900, pinned on A&B's two gates): "We have updated
 * the paywall CTAs". Every card in the file is the new one. The practice and article
 * gates draw it 330x205 (1015:1207, 1015:1232 and their siblings); the chapter-body
 * gates draw it 330x363 with three ticked features (1015:1163, 1015:1004, 1015:1257,
 * 1015:1379). Both set a gradient lock beside "Unlock full insights!", the guarantee
 * box, and a gradient "Unlock Report →" pill.
 *
 * The frames say "7-day money-back". Fatih, 29.09: keep the 14-day the Terms, the
 * landing page and every other surface promise, and flag the 7 to Mark.
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const BLOCK = "Premium card — Mark's paywall CTA, 29.09";

/** The rule for `selector` inside the 29.09 block. */
const rule = (selector: string) => {
  const from = V3_CSS.indexOf(BLOCK);
  expect(from, "the 29.09 premium card block is missing").toBeGreaterThan(-1);
  const at = V3_CSS.indexOf(`${selector} {`, from);
  expect(at, `${selector} missing from the 29.09 block`).toBeGreaterThan(-1);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

afterEach(cleanup);

describe("V4PremiumCard — the gate card (1015:1207)", () => {
  it("sets the gradient lock beside 'Unlock full insights!'", () => {
    const { container } = render(<V4PremiumCard />);
    const card = container.querySelector(".rv4-premium")!;
    expect(card.classList.contains("rv4-premium--body")).toBe(false);
    const head = card.querySelector(".rv4-premium__head")!;
    expect(head.querySelector(".rv4-premium__lock img")!.getAttribute("src")).toBe(
      "/report/v3/locks/lock-14.svg"
    );
    expect(within(card as HTMLElement).getByRole("heading").textContent).toBe(
      "Unlock full insights!"
    );
    expect(screen.queryByText("Premium content")).toBeNull();
  });

  it("keeps the 14-day guarantee the rest of the site promises", () => {
    const { container } = render(<V4PremiumCard />);
    expect(screen.getByText("14-day money-back")).toBeTruthy();
    expect(screen.getByText("Guaranteed, no questions asked.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/7-day/);
  });

  it("draws the frame's new shield and tick", () => {
    const { container } = render(<V4PremiumCard />);
    const shield = container.querySelector(".rv4-premium__shield")!;
    expect(shield.querySelector(".rv4-premium__shield-bg")!.getAttribute("src")).toBe(
      "/report/v3/premium/shield.svg"
    );
    expect(shield.querySelector(".rv4-premium__shield-tick")!.getAttribute("src")).toBe(
      "/report/v3/premium/tick.svg"
    );
  });

  it("ends on the 'Unlock Report →' pill, named for what it says", () => {
    const { container } = render(<V4PremiumCard />);
    const cta = within(container.querySelector(".rv4-premium") as HTMLElement).getByRole("button", {
      name: "Unlock Report",
    });
    expect(cta.className).toBe("rv4-premium__cta");
    // A no-break space: the pill is a flex box, which drops a plain one at the start of
    // the arrow's run ("Report→").
    expect(cta.textContent).toBe("Unlock Report →");
    expect(cta.querySelector("[aria-hidden='true']")!.textContent).toBe(" →");
  });

  it("lists no features", () => {
    const { container } = render(<V4PremiumCard />);
    expect(container.querySelector(".rv4-premium__feats")).toBeNull();
  });
});

describe("V4PremiumCard — the chapter-body card (1015:1163)", () => {
  it("adds the three ticked features, each with the frame's check", () => {
    const { container } = render(<V4PremiumCard variant="body" nodeId="1015:1163" />);
    const card = container.querySelector(".rv4-premium")!;
    expect(card.classList.contains("rv4-premium--body")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("1015:1163");
    const feats = [...card.querySelectorAll(".rv4-premium__feats > li")];
    expect(feats.map((li) => li.textContent)).toEqual([
      "Your complete archetype report",
      "+20 chapters and personalised growth",
      "Finally understand old patterns and learn how to move past them",
    ]);
    for (const li of feats) {
      const img = li.querySelector("img")!;
      expect(img.getAttribute("src")).toBe("/report/v3/premium/check.svg");
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("draws the body card's own, wider tick", () => {
    const { container } = render(<V4PremiumCard variant="body" />);
    expect(container.querySelector(".rv4-premium__shield-tick")!.getAttribute("src")).toBe(
      "/report/v3/premium/tick-body.svg"
    );
  });
});

describe("where each variant goes", () => {
  it("puts the body card on Typical Beliefs' body gate (1015:1004)", () => {
    const { container } = render(
      <V4TypicalBeliefs view={buildTypicalBeliefs("Spark Seeker", { locked: true })!} />
    );
    const card = container.querySelector(".rv4-tb__gate .rv4-premium")!;
    expect(card.classList.contains("rv4-premium--body")).toBe(true);
    expect(card.getAttribute("data-node-id")).toBe("1015:1004");
  });

  it("keeps the gate card on the practice gate", () => {
    const { container } = render(
      <V4TryThis
        practice={buildTypicalBeliefs("Spark Seeker", { locked: true })!.practice}
        defaultOpen
      />
    );
    const card = container.querySelector(".rv4-try__rest .rv4-premium")!;
    expect(card.classList.contains("rv4-premium--body")).toBe(false);
  });
});

describe("reportV3.css — the 29.09 card", () => {
  it("draws the gate card 330x205 and the body card 330x363", () => {
    const card = rule(".rv3 .rv4-premium");
    expect(card).toContain("height: 205px;");
    expect(card).toContain("width: 330px;");
    // 1015:1163 starts its head 25.719 down (the stroke inside, as CSS lays it).
    const body = rule(".rv3 .rv4-premium--body");
    expect(body).toContain("height: 363px;");
    expect(body).toContain("padding-top: 25px;");
  });

  it("keeps the gradient stroke the cards still carry ('Logo Gradient Temporary')", () => {
    const card = rule(".rv3 .rv4-premium");
    expect(card).toContain("border: 0.719px solid transparent;");
    expect(card).toContain("linear-gradient(#fff, #fff) padding-box");
    expect(card).toContain(
      "linear-gradient(120deg, #fe6839 0%, #c167cf 52%, #8887f6 100%) border-box"
    );
  });

  it("sets 'Unlock full insights!' in Lora SemiBold 20/28.8 beside a 28px gradient lock", () => {
    const title = rule(".rv3 .rv4-premium__title");
    expect(title).toContain("font-size: 20px;");
    expect(title).toContain("font-weight: 600;");
    expect(title).toContain("line-height: 28.8px;");
    expect(title).toContain("letter-spacing: -0.4666px;");
    const lock = rule(".rv3 .rv4-premium__lock");
    expect(lock).toContain("height: 28px;");
    expect(lock).toContain(
      "linear-gradient(135deg, #fb683e 14.644%, #e88c8c 51.414%, #ac88ed 85.356%)"
    );
    expect(lock).toContain("box-shadow: 0 3.294px 4.941px rgba(168, 90, 76, 0.3);");
  });

  it("sets the guarantee in Bold 14/22.4 green over the grey line, the body card's box 47 tall", () => {
    const head = rule(".rv3 .rv4-premium__guarantee-head");
    expect(head).toContain("font-size: 14px;");
    expect(head).toContain("line-height: 22.4px;");
    expect(head).toContain("color: #009148;");
    expect(rule(".rv3 .rv4-premium__guarantee-sub")).toContain("color: #505253;");
    expect(rule(".rv3 .rv4-premium--body .rv4-premium__guarantee-sub")).toContain(
      "color: #6b6678;"
    );
    expect(rule(".rv3 .rv4-premium--body .rv4-premium__guarantee")).toContain("height: 47px;");
  });

  it("draws the shield at its file's 29.5, the stroke's overhang around the 28.78 box", () => {
    // 1015:1181 / 1015:1225: a 28.779 box, its image inset -1.25% all round.
    const bg = rule(".rv3 .rv4-premium__shield-bg");
    expect(bg).toContain("height: 29.499px;");
    expect(bg).toContain("width: 29.499px;");
    expect(bg).toContain("margin: -0.36px;");
  });

  it("sets the features in Light 12/19.2 grey, the checks 11 from the text", () => {
    const feat = rule(".rv3 .rv4-premium__feats > li");
    expect(feat).toContain("gap: 11px;");
    expect(feat).toContain("font-size: 12px;");
    expect(feat).toContain("font-weight: 300;");
    expect(feat).toContain("line-height: 19.2px;");
    expect(feat).toContain("color: #6b6678;");
  });

  it("gives the last feature the frame's 242px, into the card's padding, so it breaks after 'learn'", () => {
    // 1015:1204 is 242 wide from x=72, past the content box (297): the list is 27 + 242.
    expect(rule(".rv3 .rv4-premium__feats")).toContain("width: 269px;");
    // Below 362 the card narrows, and the list takes what the card leaves it.
    const small = V3_CSS.slice(V3_CSS.indexOf("@media (max-width: 361px)", V3_CSS.indexOf(BLOCK)));
    const feats = small.slice(small.indexOf(".rv3 .rv4-premium__feats {"));
    expect(feats.slice(0, feats.indexOf("}"))).toContain("width: auto;");
  });

  it("draws the pill 163x32 in the brand gradient, where each frame sets it", () => {
    const pill = rule(".rv3 .rv4-premium__cta");
    expect(pill).toContain("width: 163px;");
    expect(pill).toContain("height: 32px;");
    expect(pill).toContain("border-radius: 999px;");
    expect(pill).toContain(
      "linear-gradient(168.893deg, #fb683e 14.644%, #e88c8c 51.414%, #ac88ed 85.356%)"
    );
    expect(pill).toContain("box-shadow: 0 4px 12px rgba(168, 90, 76, 0.3);");
    expect(pill).toContain("font-size: 12px;");
    expect(pill).toContain("font-weight: 700;");
    // 1015:1229 at 147 and 1015:1205 at 302.28 of the card, less the 0.719 stroke.
    expect(pill).toContain("top: 146.281px;");
    expect(rule(".rv3 .rv4-premium--body .rv4-premium__cta")).toContain("top: 301.561px;");
  });

  it("answers the pointer on the pill as the round's other CTAs do", () => {
    const at = V3_CSS.indexOf("@media (hover: hover) and (pointer: fine)", V3_CSS.indexOf(BLOCK));
    expect(at).toBeGreaterThan(-1);
    const hover = V3_CSS.slice(at, V3_CSS.indexOf("\n}\n", at));
    expect(hover).toContain(".rv3 .rv4-premium__cta:hover");
    expect(hover).toContain("translate: 0 -1px;");
    expect(rule(".rv3 .rv4-premium__cta:focus-visible")).toContain(
      "outline: 2px solid var(--rv3-violet);"
    );
  });
});
