import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Try this" to "Go deeper" — review round 25.09. Mark (1941885039): the frames leave
 * 16.2 between the two cards in Fantasy vs. Reality — the practice card ends 16 above
 * 441:6168's foot and "Go deeper" starts 0.175 into 244:258 — where the report set them
 * flush. Typical Beliefs' 24 (374:238) and A&B's 16 (310:229) are their own frames'.
 */
const css = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const block = (selector: string) => {
  const at = css.lastIndexOf(selector);
  expect(at, `${selector} missing`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("V4 — the space between 'Try this' and 'Go deeper'", () => {
  it("leaves Fantasy vs. Reality's 16.2 (441:6168 → 244:258)", () => {
    expect(block(".rv3 .rv4-chapter__body.is-bare > .rv4-fvr ~ .rv4-learn {")).toContain(
      "margin-top: 16.2px;"
    );
  });

  it("keeps Typical Beliefs' 24 and A&B's 16", () => {
    expect(block(".rv3 .rv4-chapter__body.is-bare > .rv4-learn {")).toContain("margin-top: 24px;");
    expect(block(".rv3 .rv4-chapter__body.is-bare > .rv4-ab ~ .rv4-learn {")).toContain(
      "margin-top: 16px;"
    );
  });
});
