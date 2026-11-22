import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import tokens from "@features/mira/ui/theme-tokens.js";

/**
 * Mira's light/dark tokens and text sizes, through the real tailwind.config.js: what every Mira
 * component (and the AP admin, which shares the ap-* colours) actually gets.
 */
const config = require("../../../tailwind.config.js");

async function compile(classes: string): Promise<string> {
  const out = await postcss([
    tailwindcss({
      ...config,
      // MiraPrefs.tsx renders .mira-root on every Mira page; Tailwind emits its rules only then.
      content: [{ raw: `<div class="mira-root ${classes}"></div>`, extension: "html" }],
      corePlugins: { ...config.corePlugins, preflight: false },
    }),
  ]).process("@tailwind base; @tailwind utilities;", { from: undefined });
  return out.css;
}

/** Every declaration of `prop` in the rules whose selector is exactly `selector`. */
function decls(css: string, selector: string, prop: string, media?: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    const parent = rule.parent as postcss.AtRule | undefined;
    const inMedia = parent?.type === "atrule" ? parent.params : undefined;
    if (rule.selector !== selector || inMedia !== media) return;
    rule.walkDecls(prop, (d) => {
      found.push(d.value.trim());
    });
  });
  return found;
}

const hexToChannels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

afterEach(() => vi.restoreAllMocks());

describe("Mira's text size", () => {
  it("scales every font size inside .mira-root by --mira-fs, and leaves the rest of the site as it was", async () => {
    const css = await compile("text-[15px] sm:text-[22px] text-sm leading-6");
    // Outside Mira: exactly the sizes the classes always gave.
    expect(decls(css, ".text-\\[15px\\]", "font-size")).toEqual(["15px"]);
    expect(decls(css, ".sm\\:text-\\[22px\\]", "font-size", "(min-width: 640px)")).toEqual([
      "22px",
    ]);
    // Inside Mira: the same size times the chosen scale.
    expect(decls(css, ":where(.mira-root) .text-\\[15px\\]", "font-size")).toEqual([
      "calc(15px * var(--mira-fs, 1))",
    ]);
    expect(
      decls(css, ":where(.mira-root) .sm\\:text-\\[22px\\]", "font-size", "(min-width: 640px)")
    ).toEqual(["calc(22px * var(--mira-fs, 1))"]);
    // A named size keeps its line height (and leading-* still wins over it).
    expect(decls(css, ".text-sm", "line-height")).toEqual(["1.25rem"]);
    expect(decls(css, ":where(.mira-root) .text-sm", "font-size")).toEqual([
      "calc(0.875rem * var(--mira-fs, 1))",
    ]);
    expect(css.indexOf(".leading-6")).toBeGreaterThan(css.indexOf(".text-sm"));
  });

  it("never makes an arbitrary size ambiguous, and leaves em, % and clamp() alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const css = await compile("text-[0.9em] text-[clamp(1rem,2vw,2rem)] text-[1.0625rem]");
    expect(warn).not.toHaveBeenCalled();
    expect(decls(css, ".text-\\[0\\.9em\\]", "font-size")).toEqual(["0.9em"]);
    expect(decls(css, ":where(.mira-root) .text-\\[0\\.9em\\]", "font-size")).toEqual([]);
    expect(decls(css, ".text-\\[clamp\\(1rem\\2c 2vw\\2c 2rem\\)\\]", "font-size")).toEqual([
      "clamp(1rem, 2vw, 2rem)",
    ]);
    expect(css).not.toContain("calc(clamp");
    expect(decls(css, ":where(.mira-root) .text-\\[1\\.0625rem\\]", "font-size")).toEqual([
      "calc(1.0625rem * var(--mira-fs, 1))",
    ]);
  });

  it("sets the scale per choice, keeps form fields at 16px or more on Small (iOS zooms below)", async () => {
    const css = await compile("text-[16px]");
    expect(decls(css, '.mira-root[data-mira-text="large"]', "--mira-fs")).toEqual(["1.15"]);
    expect(decls(css, '.mira-root[data-mira-text="small"]', "--mira-fs")).toEqual(["0.9"]);
    expect(
      decls(css, '.mira-root[data-mira-text="small"] :is(input, textarea, select)', "--mira-fs")
    ).toEqual(["1"]);
    expect(
      decls(css, "html:has(.mira-root)", "scroll-behavior", "(prefers-reduced-motion: reduce)")
    ).toEqual(["auto"]);
    // Text without a size class inherits a scaled base.
    expect(decls(css, ".mira-root", "font-size")).toEqual(["calc(1rem * var(--mira-fs, 1))"]);
  });
});

describe("Mira's serif", () => {
  it("is Lora wherever font-serif is set, a variant's too (UX-2: the guide's h2 in Georgia)", async () => {
    const css = await compile("font-serif [&_h2]:font-serif sm:font-serif");
    const families: string[] = [];
    postcss.parse(css).walkRules((rule) => {
      if (rule.selector.includes("font-serif"))
        rule.walkDecls("font-family", (d) => families.push(d.value));
    });
    expect(families).toHaveLength(3);
    for (const f of families) expect(f).toBe('var(--font-serif, "Lora", "Times New Roman", serif)');
  });
});

describe("Mira's colours", () => {
  it("are CSS variables with today's light values on :root, so AP and Mira's light look don't change", async () => {
    const css = await compile("bg-white text-ap-ink bg-ap-mist/40 border-ap-line");
    expect(decls(css, ".text-ap-ink", "color")).toEqual([
      "rgb(var(--ap-ink) / var(--tw-text-opacity, 1))",
    ]);
    expect(decls(css, ".bg-ap-mist\\/40", "background-color")).toEqual([
      "rgb(var(--ap-mist) / 0.4)",
    ]);
    expect(decls(css, ".bg-white", "background-color")).toEqual([
      "rgb(var(--ap-paper) / var(--tw-bg-opacity, 1))",
    ]);
    // The values the classes had before they became variables (tailwind.config.js, 12 Oct 2026).
    const before: Record<string, string> = {
      ink: "#161021",
      body: "#3f3a4d",
      muted: "#6b6678",
      label: "#5f6675",
      quiet: "#9c95a3",
      line: "#e9e6ee",
      ground: "#f5f6f8",
      lilac: "#f3ecff",
      track: "#f0eef4",
      purple: "#795fc8",
      violet: "#4000b6",
      plum: "#6b5b95",
      lavender: "#9d8ad7",
      mist: "#d6cff0",
      orange: "#fe6839",
      good: "#2e7d5b",
      "good-ink": "#1f5c42",
      bad: "#d63200",
      "bad-ink": "#a62700",
      pii: "#a8431f",
      paper: "#ffffff",
    };
    for (const [name, hex] of Object.entries(before)) {
      expect(decls(css, ":root", `--ap-${name}`), name).toEqual([hexToChannels(hex)]);
    }
  });

  it("turn dark only inside a Mira page set to Dark, or to System on a dark device", async () => {
    const css = await compile("bg-white");
    const dark = hexToChannels(tokens.MIRA_DARK.paper);
    expect(decls(css, ':root:has(.mira-root[data-mira-theme="dark"])', "--ap-paper")).toEqual([
      dark,
    ]);
    expect(
      decls(
        css,
        ':root:has(.mira-root[data-mira-theme="system"])',
        "--ap-paper",
        "(prefers-color-scheme: dark)"
      )
    ).toEqual([dark]);
    expect(decls(css, ':root:has(.mira-root[data-mira-theme="dark"])', "color-scheme")).toEqual([
      "dark",
    ]);
    // Every light token has a dark one.
    expect(Object.keys(tokens.MIRA_DARK).sort()).toEqual(Object.keys(tokens.AP_LIGHT).sort());
  });
});

/** WCAG 2.2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("the dark palette", () => {
  const d = tokens.MIRA_DARK;
  it("keeps text at AA (4.5:1) on the page and on the surfaces text sits on", () => {
    for (const text of ["ink", "body", "muted", "label", "plum", "purple", "link"] as const) {
      for (const bg of ["paper", "ground", "lilac", "track"] as const) {
        expect(contrast(d[text], d[bg]), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const text of ["good-ink", "bad-ink", "quiet"] as const) {
      expect(contrast(d[text], d.paper), text).toBeGreaterThanOrEqual(4.5);
    }
    // text-white is the paper colour: on the ink pill and the filled buttons.
    for (const fill of ["ink", "purple", "bad", "good", "plum"] as const) {
      expect(contrast(d.paper, d[fill]), `paper on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps focus borders and filled controls at 3:1 against the page", () => {
    for (const ui of ["lavender", "purple", "orange", "bad", "good"] as const) {
      expect(contrast(d[ui], d.paper), ui).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("field borders (A11Y-8, WCAG 1.4.11)", () => {
  it("are 3:1 against every surface a field sits on, in both themes", () => {
    for (const [theme, t] of [
      ["light", tokens.AP_LIGHT],
      ["dark", tokens.MIRA_DARK],
    ] as const) {
      for (const bg of ["paper", "ground", "lilac"] as const) {
        expect(contrast(t.field, t[bg]), `${theme}: field on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
