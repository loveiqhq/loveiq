import { describe, expect, it } from "vitest";
import { readAppCss } from "@shared/testing/read-app-css";

/**
 * The page a buyer lands on after paying (/checkout/return) sits on the white
 * checkout background, but until 2026-10-02 its copy kept the old dark theme's
 * white text: "Payment complete. Your report is unlocked." and every error on the
 * page were white on near-white. This reads the colours the CSS actually ends up
 * with (the last rule wins) and checks each one against the card and the page.
 */
// Comments are dropped so a rule that follows one is still found.
const css = readAppCss().replace(/\/\*[\s\S]*?\*\//g, "");

function lastDeclaration(selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`, "g");
  let value: string | null = null;
  for (const match of css.matchAll(rule)) {
    const decl = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(match[1]);
    if (decl) value = decl[1].trim();
  }
  if (!value) throw new Error(`no ${property} for ${selector}`);
  return value;
}

type Rgb = [number, number, number];

function parseColor(value: string, under: Rgb = [255, 255, 255]): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!rgba) throw new Error(`unparsed colour ${value}`);
  const [r, g, b, a = 1] = rgba[1].split(",").map((n) => Number(n.trim()));
  // Paint a translucent colour over what is underneath it.
  return [r, g, b].map((c, i) => c * a + under[i] * (1 - a)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The page colour is the last stop of the .checkout-page background stack.
const pageBg = parseColor(
  /(#[0-9a-f]{3,6})\s*$/i.exec(lastDeclaration(".checkout-page", "background"))![1]
);
const cardBg = parseColor(lastDeclaration(".checkout-return", "background"), pageBg);

describe("checkout return page is readable", () => {
  it.each([
    ".checkout-return__eyebrow",
    ".checkout-return__title",
    ".checkout-return__copy",
    ".checkout-return__copy strong",
    ".checkout-return__link",
  ])("%s meets WCAG AA (4.5:1) on the card and the page", (selector) => {
    const text = parseColor(lastDeclaration(selector, "color"), cardBg);
    expect(contrast(text, cardBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, pageBg)).toBeGreaterThanOrEqual(4.5);
  });
});
