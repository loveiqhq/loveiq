import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "@features/mira/ui/theme-tokens.js";

/**
 * Mira's colours on every new screen, in both themes (the default look is System, so every
 * dark-mode device gets Dark): each pair of tokens a screen puts text or a control on, computed
 * as WCAG contrast, and a sweep of Mira's UI for colours written as hex, which never follow the
 * theme. Pairs found by the audit of 22 Nov 2026 and axe on staging are named after their screen.
 */

type Palette = Record<keyof typeof tokens.AP_LIGHT, string>;
const THEMES: Array<[string, Palette]> = [
  ["light", tokens.AP_LIGHT],
  ["dark", tokens.MIRA_DARK],
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** WCAG 2.2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** `fg` at `alpha` over `bg`, as `bg-ap-x/NN` paints it on the page. */
const over = (fg: string, alpha: number, bg: string) =>
  `#${rgb(fg)
    .map((c, i) => Math.round(alpha * c + (1 - alpha) * rgb(bg)[i]!))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;

/** [what, text or control colour, what it sits on, the minimum]: 4.5 text, 3 large text and UI. */
const pairs = (p: Palette): Array<[string, string, string, number]> => [
  // Self-checks.
  ["Mood check question 9: 'talk to Mira now' on lilac", p.link, p.lilac, 4.5],
  ["Check trend: score label on the top band's tint", p.ink, over(p.purple, 0.3, p.paper), 4.5],
  ["Check trend: score label on the lowest band's tint", p.ink, over(p.purple, 0.02, p.paper), 4.5],
  ["Home › assessments: status on a row's hover", p.muted, over(p.lilac, 0.5, p.paper), 4.5],
  ["Home › assessments: action on a row's hover", p.purple, over(p.lilac, 0.5, p.paper), 4.5],
  // Coaches.
  ["Find my challenge: heading on its gradient", p.ink, over(p.lilac, 0.6, p.paper), 4.5],
  ["Find my challenge: muted line on its gradient", p.muted, over(p.lilac, 0.6, p.paper), 4.5],
  // Every ink pill (voice, weekly session, goals, passkey, recordings, coaches) on hover.
  ["Ink button's label on its hover (ink/90)", p.paper, over(p.ink, 0.9, p.paper), 4.5],
  // Settings › Sign-in & security.
  ["Sign-in & security: success notice", p["good-ink"], over(p.good, 0.1, p.paper), 4.5],
  // Ratings: the initials' three tints, and the stars.
  ["Public reviews: initials on lilac", p.plum, p.lilac, 4.5],
  ["Public reviews: initials on coral", p.pii, over(p.orange, 0.15, p.paper), 4.5],
  ["Public reviews: initials on mist", p.violet, over(p.mist, 0.5, p.paper), 4.5],
  // Journal: links, "Open journal", the week's "today" label (10px), the switch.
  ["Journal links and today's label on the page", p.link, p.paper, 4.5],
  ["Journal links on a grey surface", p.link, p.ground, 4.5],
  ["Journal switch: its knob on the track when off", p.paper, over(p.muted, 0.75, p.paper), 3],
  ["Journal switch: the track when off on the page", over(p.muted, 0.75, p.paper), p.paper, 3],
  ["Journal week: a checked-in day's tick on its tint", p.purple, over(p.purple, 0.1, p.paper), 3],
  // Recordings: the weekday over each voice session's date.
  ["Recordings: the weekday", p.pii, p.paper, 4.5],
  // Settings › Appearance › Text size: the chosen size is the ink pill (round-2 SET-S1b; paper
  // on the grey track was 1.1:1 in Dark), its label paper on ink.
  ["Text size: the chosen pill on its track", p.ink, p.ground, 3],
  ["Text size: the chosen size's label", p.paper, p.ink, 4.5],
  // The logo's BETA, "Your chats" and other small labels (muted, not quiet).
  ["Small labels (BETA, 'Your chats') on the page", p.muted, p.paper, 4.5],
  ["Small labels on a grey surface", p.muted, p.ground, 4.5],
];

describe("Mira's colour pairs", () => {
  for (const [theme, p] of THEMES) {
    it(`reach WCAG AA in the ${theme} theme`, () => {
      const failing = pairs(p)
        .map(
          ([what, fg, bg, min]) => [what, Math.round(contrast(fg, bg) * 100) / 100, min] as const
        )
        .filter(([, ratio, min]) => ratio < min);
      expect(failing).toEqual([]);
    });
  }

  it("leave quiet and lavender out of text: below 4.5:1 on white", () => {
    expect(contrast(tokens.AP_LIGHT.quiet, tokens.AP_LIGHT.paper)).toBeLessThan(4.5);
    expect(contrast(tokens.AP_LIGHT.lavender, tokens.AP_LIGHT.paper)).toBeLessThan(4.5);
  });
});

/** Colours that must not follow the theme: the brand's gradient stops and Google's "G". */
const FIXED = new Set([
  "#fe6839",
  "#bf66d9",
  "#958ef6",
  "#d05976",
  "#c167cf",
  "#8887f6",
  "#ea4335",
  "#4285f4",
  "#fbbc05",
  "#34a853",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("Mira's screens", () => {
  // The link-preview image is a picture, drawn once in the brand's colours.
  const sources = [...files("features/mira/ui"), ...files("app/mira")].filter(
    (f) => !f.endsWith("opengraph-image.tsx")
  );

  it("write every colour that should follow the theme as an ap-* token, never as hex", () => {
    const found: string[] = [];
    for (const file of sources) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/#[0-9a-f]{3,8}(?![0-9a-z])/gi)) {
            const hex = m[0].toLowerCase();
            if (FIXED.has(hex)) continue;
            // White letters on a brand gradient, which stays the same in both themes.
            if (hex === "#fff" && line.includes("text-[#fff]")) continue;
            // An alpha mask, not a colour.
            if (hex === "#000" && line.includes("mask-image")) continue;
            found.push(`${file}:${i + 1} ${hex}`);
          }
          if (
            /(?<![\w:-])(?:text|bg|border|ring|fill|stroke)-(?:black|gray|slate|zinc|neutral|stone)\b/.test(
              line
            )
          )
            found.push(`${file}:${i + 1} a named grey`);
          // Quiet and lavender are below 4.5:1 on white (above): never text or an icon's colour.
          if (/(?<![\w:-])text-ap-(?:quiet|lavender)\b/.test(line))
            found.push(`${file}:${i + 1} text-ap-quiet/lavender`);
        });
    }
    expect(found).toEqual([]);
  });

  it("keep the brand's fixed colours readable on both papers", () => {
    // The orchid dot, sparks and rings Mira uses as accents: UI, so 3:1.
    for (const [, p] of THEMES) expect(contrast("#bf66d9", p.paper)).toBeGreaterThanOrEqual(3);
  });
});
