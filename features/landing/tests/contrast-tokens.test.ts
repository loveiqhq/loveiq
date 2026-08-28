import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

/**
 * WCAG AA contrast on the landing page.
 *
 * Lighthouse scored accessibility 97 on 2026-08-28 with contrast the only failing
 * category: the accent orange used for LINK TEXT (2.97:1 on white), the muted grey
 * used for FAQ numbers and constellation labels (2.88:1), and CookieYes' own consent
 * buttons (4.15:1). All need 4.5:1.
 *
 * The brand orange itself is deliberately unchanged — it stays on fills, borders and
 * buttons, where contrast rules do not apply the same way. Only text moved to a
 * darker tone of the same hue. That split is the pattern S06Archetypes already
 * documents for the archetype cards.
 */
const RELATIVE_LUMINANCE = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [RELATIVE_LUMINANCE(a), RELATIVE_LUMINANCE(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const css = readAppCss();
const tokenValue = (name: string) =>
  new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? "";

describe("landing contrast", () => {
  it("defines a text-only accent that passes AA on white", () => {
    const ink = tokenValue("--accent-orange-ink");
    expect(ink, "--accent-orange-ink not defined").toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves the BRAND orange alone, so fills and buttons are unchanged", () => {
    // The point of a separate token: --accent-orange must stay exactly as designed.
    // If someone "fixes" contrast by darkening this one, every button changes colour.
    expect(tokenValue("--accent-orange").toLowerCase()).toBe("#f26d4f");
  });

  it("uses no failing colour for text anywhere on the landing", () => {
    /**
     * The guard with teeth. Both of these are below 3:1 on white, so they fail even
     * the large-text threshold — there is no size at which they are acceptable as
     * text. Discovered by grep so a new component is covered without editing this.
     */
    const banned = ['text-accent-orange"', "text-accent-orange ", "text-[#9a96a6]"];
    const files = execSync("find features/landing/ui -name '*.tsx'", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const b of banned) {
        if (src.includes(b)) offenders.push(`${f} :: ${b.trim()}`);
      }
    }
    expect(offenders, `these fail WCAG AA as text:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("overrides the CookieYes buttons, whose colour is an inline style", () => {
    // Inline styles can only be beaten with !important; without it the rule is inert
    // and the banner silently keeps failing.
    const at = css.indexOf(".cky-btn-accept");
    expect(at, "CookieYes override missing").toBeGreaterThan(-1);
    const block = css.slice(at, at + 260);
    const blue = /background-color:\s*(#[0-9a-fA-F]{6})\s*!important/.exec(block)?.[1] ?? "";
    expect(blue, "override must use !important to beat the inline style").toMatch(/^#/);
    expect(contrast(blue, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
