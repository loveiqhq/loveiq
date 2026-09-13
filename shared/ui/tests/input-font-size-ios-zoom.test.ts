import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * iOS Safari ZOOMS THE WHOLE PAGE IN when a focused form control has a
 * font-size below 16px, and it does not zoom back out — every screen after
 * that stays magnified for the rest of the visit.
 *
 * This was not theoretical. The survey's country search rendered at 15px, and
 * 175 of 177 zoomed iOS sessions measured a viewport ratio of 1.065-1.067 —
 * exactly 16/15, the factor iOS applies to scale a 15px input up to 16px. Zero
 * Android sessions showed it, because only iOS does this. One reader
 * rage-clicked at the moment their viewport went 414 -> 388 -> 378, on
 * question 38 of 59, leaving the remaining 21 questions magnified.
 *
 * Only the UNPREFIXED size matters: `sm:text-[15px]` applies above the mobile
 * breakpoint, where no auto-zoom exists, so a smaller desktop size is fine.
 */
const NAMED: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
const ROOTS = ["features", "shared", "app"];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "tests") continue;
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

function offenders() {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of tsxFiles(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
        const start = m.index ?? 0;
        const slice = src.slice(start, start + 700);
        const end = slice.indexOf(">");
        const tag = slice.slice(0, end > 0 ? end : 700);
        // `(?<![:\w-])` keeps `sm:text-sm` / `md:text-[14px]` out — those only
        // apply above the mobile breakpoint.
        const sizes = [...tag.matchAll(/(?<![:\w-])text-\[(\d+(?:\.\d+)?)px\]/g)].map((x) =>
          parseFloat(x[1]!)
        );
        const named = [...tag.matchAll(/(?<![:\w-])text-(xs|sm|base|lg|xl)\b/g)].map(
          (x) => NAMED[x[1]!]!
        );
        const line = src.slice(0, start).split("\n").length;
        for (const px of [...sizes, ...named]) {
          if (px < 16) found.push(`${file}:${line} <${m[1]}> font-size ${px}px`);
        }
      }
    }
  }
  return found;
}

describe("form controls never trigger the iOS auto-zoom", () => {
  it("has no input, textarea or select under 16px at mobile width", () => {
    const bad = offenders();
    expect(
      bad,
      `These controls will zoom iOS in and never zoom back out. Give them a\n` +
        `16px base and keep any smaller size behind a breakpoint prefix, e.g.\n` +
        `  text-[16px] sm:text-[15px]\n\n` +
        bad.join("\n")
    ).toEqual([]);
  });

  it("the scanner actually detects an offender (so a green run means something)", () => {
    // Guards the guard: a regex that silently matches nothing would make the
    // test above pass forever.
    const tag = '<input className="w-full font-sans text-[15px] focus:outline-none" />';
    const sizes = [...tag.matchAll(/(?<![:\w-])text-\[(\d+(?:\.\d+)?)px\]/g)].map((x) =>
      parseFloat(x[1]!)
    );
    expect(sizes).toEqual([15]);
    const safe = '<input className="text-[16px] sm:text-[15px]" />';
    const safeSizes = [...safe.matchAll(/(?<![:\w-])text-\[(\d+(?:\.\d+)?)px\]/g)].map((x) =>
      parseFloat(x[1]!)
    );
    // the sm: one must NOT be picked up
    expect(safeSizes).toEqual([16]);
  });
});
