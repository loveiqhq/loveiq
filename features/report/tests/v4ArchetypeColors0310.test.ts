import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { reportThemes } from "@features/report/ui/reportTheme";
import { v4ArchetypeColors, v4InkStyle } from "@features/report/ui/v3/v4ArchetypeColors";

/**
 * Fatih, 03.10: the other 13 archetype cards take "each archetype's own" colours, the
 * report theme's (accent and its contrast-safe ink, the palette its top-three row and old
 * card already use), and Spark Seeker's card stays pixel-identical: its colours are the
 * frame's (15:815), kept to the hex.
 */
const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const onWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe("the V4 archetype colours (Fatih, 03.10: each archetype's own)", () => {
  it("keeps Spark Seeker's to the frame's hex", () => {
    expect(v4ArchetypeColors("Spark Seeker")).toEqual({
      accent: "#ff6a3d",
      deep: "#f97316",
      glyph: "#ff6a3d",
      ink: "#d5451c",
      nameInk: "#d63200",
    });
  });

  it.each(KNOWN_ARCHETYPES.filter((name) => name !== "Spark Seeker"))(
    "gives %s its report theme's accent and ink",
    (name) => {
      const theme = reportThemes[name]!;
      expect(v4ArchetypeColors(name)).toEqual({
        accent: theme.accent.toLowerCase(),
        deep: theme.accentInk.toLowerCase(),
        glyph: theme.accentInk.toLowerCase(),
        ink: theme.accentInk.toLowerCase(),
        nameInk: theme.accentInk.toLowerCase(),
      });
    }
  );

  it.each(KNOWN_ARCHETYPES.filter((name) => name !== "Spark Seeker"))(
    "sets %s's text inks readable on white (4.5:1) and its glyphs at 3:1",
    (name) => {
      const { glyph, ink, nameInk } = v4ArchetypeColors(name);
      expect(onWhite(ink)).toBeGreaterThanOrEqual(4.5);
      expect(onWhite(nameInk)).toBeGreaterThanOrEqual(4.5);
      // Glyphs, the deck's active dot and its focus ring are strokes: WCAG's 3:1 for graphics.
      expect(onWhite(glyph)).toBeGreaterThanOrEqual(3);
    }
  );

  it("keeps Spark Seeker's frame ink as drawn, just under 4.5:1 (flagged to Mark)", () => {
    expect(onWhite(v4ArchetypeColors("Spark Seeker").ink)).toBeGreaterThan(4.4);
    expect(onWhite(v4ArchetypeColors("Spark Seeker").nameInk)).toBeGreaterThanOrEqual(4.5);
  });

  it("hands the page the inks as the variables the V4 rules read", () => {
    expect(v4InkStyle("Quiet Withdrawer")).toEqual({
      "--rv3-name-ink": reportThemes["Quiet Withdrawer"]!.accentInk.toLowerCase(),
      "--rv3-accent-ink": reportThemes["Quiet Withdrawer"]!.accentInk.toLowerCase(),
      "--rv3-accent-ink-rgb": "27 127 123",
    });
  });
});

describe("the card's rules read the archetype's colours, not Spark Seeker's literals", () => {
  const css = V3_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it.each([
    ".rv3 .rv3-arch",
    ".rv3 .rv3-arch__motive",
    ".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive",
  ])("%s takes the accent from --report-accent-rgb", (selector) => {
    const body = rule(selector);
    expect(body).toContain("var(--report-accent-rgb)");
    expect(body).not.toMatch(/255,\s*106,\s*61/);
  });

  it("draws the motivation glyph in the glyph colour", () => {
    const body = rule(".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive-glyph");
    expect(body).toContain("background: var(--rv3-arch-glyph)");
  });

  it("glows the focused deck card in the accent ink", () => {
    const body = rule(".rv3 .rv3-deck__card.is-focused .rv3-deck__inner");
    expect(body).toContain("var(--rv3-accent-ink-rgb");
    expect(body).not.toMatch(/213,\s*69,\s*28/);
  });
});

describe("Spark Seeker's card paints as it did (Fatih, 03.10)", () => {
  const css = V3_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  /** Every rule for the selector that reads an accent variable, Spark Seeker's values put in. */
  const withSparkValues = (selector: string) => {
    const bodies: string[] = [];
    for (
      let at = css.indexOf(`${selector} {`);
      at > -1;
      at = css.indexOf(`${selector} {`, at + 1)
    ) {
      const body = css.slice(at, css.indexOf("}", at));
      if (/var\(--(report-accent-rgb|rv3-accent-ink-rgb)/.test(body)) bodies.push(body);
    }
    expect(bodies, selector).toHaveLength(1);
    return bodies[0]!
      .replace(/rgb\(var\(--report-accent-rgb\) \/ ([\d.]+)\)/g, "rgba(255, 106, 61, $1)")
      .replace(
        /rgb\(var\(--rv3-accent-ink-rgb, 213 69 28\) \/ ([\d.]+)\)/g,
        "rgba(213, 69, 28, $1)"
      );
  };

  it("keeps Spark Seeker's theme accent the frame's #ff6a3d, which those rules read", () => {
    expect(reportThemes["Spark Seeker"]!.accentRgb).toBe("255 106 61");
  });

  const FRAME_RULE = [
    "border: 1px solid rgba(255, 106, 61, 0.45);",
    "0 20px 80px -24px rgba(255, 106, 61, 0.28),",
    "inset 0 1px 0 0 rgba(255, 106, 61, 0.14);",
  ];
  const MOTIVE_RULE = ["rgba(255, 106, 61, 0.11) 8.4861%,", "rgba(255, 106, 61, 0.05) 91.514%"];
  it.each([
    [".rv3 .rv3-arch", FRAME_RULE],
    [".rv3 .rv3-arch__motive", MOTIVE_RULE],
    [".rv3:is(.rv4, .rv4-doc) .rv3-arch__motive", MOTIVE_RULE],
    [
      ".rv3 .rv3-deck__card.is-focused .rv3-deck__inner",
      ["0 30px 60px 0 rgba(213, 69, 28, 0.28);"],
    ],
    [".rv3.rv4 .rv3-method.is-v4 .rv3-sci", FRAME_RULE],
    [".rv3.rv4 .rv4-loop__deck", FRAME_RULE],
  ])("%s reads exactly its old literals with Spark Seeker's values in", (selector, literals) => {
    const body = withSparkValues(selector);
    for (const literal of literals) expect(body).toContain(literal);
    expect(body).not.toContain("var(--report-accent-rgb)");
  });
});
