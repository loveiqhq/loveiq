import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Round 4 (R4-UXA-3): in WebKit a radio reached with an arrow key matches no :focus-visible, so a
 * ring drawn on :focus-visible alone vanished as the person moved through a group (the coaching
 * scales, the stars, Text size). A radio is focused only by the keyboard or by the click that
 * checks it, so each group repeats its ring on :focus, as the session's time field does
 * (04d94a2b7). And the stars drew a second, lavender ring with a white halo (R4-UXA-2).
 */

const UI = "features/mira/ui";
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.tsx$/.test(name) ? [full] : [];
  });
const read = (f: string) => readFileSync(path.join(UI, f), "utf8");
/** A function's own source, from its declaration to the next top-level one. */
const fn = (src: string, name: string) => {
  const from = src.indexOf(`function ${name}`);
  const to = src.indexOf("\nfunction ", from + 1);
  return src.slice(from, to === -1 ? undefined : to);
};
const FOCUS_VISIBLE_ONLY = /peer-focus-visible:|has-\[:focus-visible\]/;

describe("a radio's focus ring", () => {
  it("is drawn on :focus in every group, so WebKit's arrow keys keep it", () => {
    // Each group's ring is in these places.
    const groups: Record<string, (src: string) => string> = {
      "journal/CheckIn.tsx": (s) => fn(s, "Scale"),
      "CoachingStylePanel.tsx": (s) => s,
      "weekly-session/SlotPicker.tsx": (s) =>
        s.slice(s.indexOf("const RADIO_CHIP"), s.indexOf("const LEGEND")),
      "checks/CheckRunner.tsx": (s) => s,
      "reviews/ReviewAsk.tsx": (s) => s,
      "MiraSettings.tsx": (s) => fn(s, "ThemePicker") + fn(s, "Segmented"),
      "MiraNudges.tsx": (s) => s,
    };
    const withRadios = files(UI)
      .filter((f) => readFileSync(f, "utf8").includes('type="radio"'))
      // As the list below writes them, with "/" on Windows too.
      .map((f) => path.relative(UI, f).split(path.sep).join("/"))
      .sort();
    // A new radio group joins the list, and so this check.
    expect(withRadios).toEqual(Object.keys(groups).sort());
    for (const [file, part] of Object.entries(groups)) {
      const src = part(read(file));
      expect(src, file).not.toMatch(FOCUS_VISIBLE_ONLY);
      expect(src, file).toMatch(
        /peer-focus:outline|peer-focus:ring|has-\[:focus\]:ring|focus:outline/
      );
    }
  });

  it("is the kit's one ring on the stars, never a second lavender one", () => {
    const stars = read("reviews/ReviewAsk.tsx");
    expect(stars).not.toMatch(/ring-ap-lavender|peer-focus[^"]*:ring/);
    // The star's radio repeats Mira's ring on :focus, as the time field does.
    expect(stars).toMatch(
      /className="peer absolute inset-0[^"]*focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ap-purple"/
    );
  });
});
