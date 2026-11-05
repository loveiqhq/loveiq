import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYMENT_MARKS } from "@features/report/ui/paymentMarks";

const root = process.cwd();
const css = readFileSync(join(root, "features/report/ui/payment-logos.css"), "utf8");

describe("the official payment logos (Figma 11482:1487)", () => {
  it("draws every method of the row from its own official file", () => {
    for (const { logo } of PAYMENT_MARKS) {
      const rule = css.match(new RegExp(`\\.pay-logos__mark--${logo} \\{[^}]*\\}`))?.[0];
      expect(rule, logo).toBeDefined();
      const file = rule!.match(/url\("([^"]+)"\)/)?.[1];
      expect(file, logo).toBe(`/payment-logos/official/${logo}.svg`);
      expect(existsSync(join(root, "public", file!)), file).toBe(true);
    }
  });

  it("crops each file to its artwork and carries nothing but the drawing", () => {
    for (const { logo } of PAYMENT_MARKS) {
      const svg = readFileSync(join(root, "public/payment-logos/official", `${logo}.svg`), "utf8");
      expect(svg, logo).toMatch(
        /^<svg width="[\d.]+" height="[\d.]+" viewBox="0 [\d.]+ [\d.]+ [\d.]+"/
      );
      expect(svg, logo).not.toMatch(/<script|<image|<foreignObject|\son[a-z]+=|href="http/i);
    }
  });

  // The plan picker's row is 272px wide on a 320px phone (measured 03.11, the narrowest of the
  // four pay screens): with 8px gaps the six took about 276px and Mastercard sat alone under
  // the rest.
  it("fits the six on one row in the plan picker's 272px on a 320px phone", () => {
    const width = (logo: string) =>
      Number(css.match(new RegExp(`\\.pay-logos__mark--${logo} \\{[^}]*width: ([\\d.]+)px`))?.[1]);
    const marks = PAYMENT_MARKS.reduce((sum, { logo }) => sum + width(logo), 0);
    const narrow = css.match(/@media \(max-width: 359px\) \{[^}]*column-gap: (\d+)px/)?.[1];
    expect(marks).toBeGreaterThan(200);
    expect(narrow).toBeDefined();
    expect(marks + (PAYMENT_MARKS.length - 1) * Number(narrow)).toBeLessThanOrEqual(272 - 4);
  });
});
