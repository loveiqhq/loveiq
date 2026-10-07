import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

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
 * EVERY size a control can take matters, at every width. iOS zooms whatever the
 * width: an iPhone held sideways is 667-932px wide, past Tailwind's sm (640) and md
 * (768), and an iPad wider still. So `text-base sm:text-sm` zooms a landscape iPhone
 * in at 14px (final review, 30.09: the staging login and the report's comment box
 * still did). Only the placeholder's or the file button's own size is left out: it
 * does not size what a reader types.
 *
 * 30.09 — it came back ("zoomed in a bit, and the whole page scrolls sideways")
 * through two holes in this scanner, which had passed the whole time:
 *  - it read a tag only up to its first ">", and `onChange={(e) => …}` has one,
 *    so most controls were cut off before their className. The staging login's
 *    14px password box went unread, and the site moves you from it to the report
 *    with a client-side navigation, so the zoom stays for the whole visit;
 *  - it read only Tailwind classes, so a control sized by a stylesheet class was
 *    invisible — the report's 14px "Does this resonate?" comment box.
 * It now walks a tag the way JSX does, and resolves each class a control carries
 * against the stylesheets, every rule for it at every width.
 *
 * The admin is left out: an internal desktop tool, 200+ controls at 12-14px.
 */
const NAMED: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
const ROOTS = ["features", "shared", "app"];
const EXEMPT = [`features${sep}admin${sep}`, `app${sep}admin${sep}`];
/** iOS zooms only the controls a reader types into or picks from. */
const NO_ZOOM_TYPES =
  /\btype=["'](?:checkbox|radio|range|hidden|file|color|submit|button|reset|image)["']/;
/** Variants that size a part of the control, not the text a reader types into it. */
const NOT_THE_TEXT = /(?:^|:)(?:placeholder|file|before|after|marker|selection):$/;

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "tests") continue;
      out.push(...files(full, ext));
    } else if (entry.endsWith(ext) && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The opening tag starting at `start`, up to the `>` that closes it. A `>` inside
 * a `{…}` expression (an arrow function) or inside a string does not close it.
 */
export function openingTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    } else if (c === ">" && depth === 0) {
      return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

/**
 * Every Tailwind size and inline `fontSize` on a tag, in px, at any width: `sm:text-sm`
 * and `md:text-[14px]` count as much as `text-sm`. Placeholder and file-button sizes do
 * not (NOT_THE_TEXT).
 */
export function tagSizes(tag: string): number[] {
  const sizes: number[] = [];
  const TOKEN = /(?<![\w-])((?:[\w-]+:)*)text-(?:\[(\d+(?:\.\d+)?)px\]|(xs|sm|base|lg|xl)\b)/g;
  for (const m of tag.matchAll(TOKEN)) {
    if (NOT_THE_TEXT.test(m[1] ?? "")) continue;
    sizes.push(m[2] ? parseFloat(m[2]) : NAMED[m[3]!]!);
  }
  const inline = [...tag.matchAll(/fontSize:\s*["'`]?(\d+(?:\.\d+)?)(px|rem|em|%)?/g)]
    .filter((x) => x[2] !== "em" && x[2] !== "%")
    .map((x) => parseFloat(x[1]!) * (x[2] === "rem" ? 16 : 1));
  return [...sizes, ...inline];
}

interface CssSize {
  px: number;
  /** The media query the rule sits in, if any, for the report. */
  media: string;
}

const FONT_SIZE = /(?:^|;)\s*font-size:\s*(\d+(?:\.\d+)?)(px|rem)\b/;
const FONT_SHORTHAND = /(?:^|;)\s*font:\s*(?:[a-z-]+\s+|\d{3}\s+)*(\d+(?:\.\d+)?)(px|rem)\b/;

/**
 * Every font-size a class's own rules set, at any width, from CSS source:
 * `.a { font-size: 14px }` and `.b .a { … }` both size `.a`, inside a media query or
 * not. Rules on a pseudo-class or pseudo-element (`:focus`, `::placeholder`) are
 * skipped.
 */
export function cssClassSizes(css: string): Map<string, CssSize[]> {
  const out = new Map<string, CssSize[]>();
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: { head: string; depth: number }[] = [];
  let depth = 0;
  let prelude = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "{") {
      const head = prelude.trim();
      prelude = "";
      depth++;
      if (head.startsWith("@")) {
        blocks.push({ head, depth });
        continue;
      }
      const close = src.indexOf("}", i);
      const body = src.slice(i + 1, close);
      i = close;
      depth--;
      const size = FONT_SIZE.exec(body) ?? FONT_SHORTHAND.exec(body);
      if (!size) continue;
      const px = parseFloat(size[1]!) * (size[2] === "rem" ? 16 : 1);
      const media = blocks.map((b) => b.head).join(" ");
      for (const selector of head.split(",")) {
        const last =
          selector
            .trim()
            .split(/[\s>+~]+/)
            .pop() ?? "";
        if (last.includes(":")) continue;
        for (const cls of last.match(/\.[\w-]+/g) ?? []) {
          const name = cls.slice(1);
          out.set(name, [...(out.get(name) ?? []), { px, media }]);
        }
      }
    } else if (c === "}") {
      if (blocks.length && blocks[blocks.length - 1]!.depth === depth) blocks.pop();
      depth--;
      prelude = "";
    } else if (c === ";" && depth === blocks.length) {
      prelude = ""; // an at-rule statement (@import) or a declaration in @font-face
    } else {
      prelude += c;
    }
  }
  return out;
}

/** The smallest size any of a class's rules sets, at any width: the one that zooms. */
export function smallestSize(sizes: CssSize[] | undefined): CssSize | null {
  if (!sizes?.length) return null;
  return sizes.reduce((min, s) => (s.px < min.px ? s : min));
}

/** The `{…}` expression at the start of `src`, braces balanced, without the braces. */
function braced(src: string): string {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(1, i);
  }
  return src;
}

/**
 * The stylesheet class names a tag's className can carry. Hyphenated tokens only:
 * a class name, never a JS identifier (those are camelCase) in a `{…}` expression.
 */
export function classNames(tag: string): string[] {
  const at = tag.search(/\bclassName=/);
  if (at < 0) return [];
  const rest = tag.slice(at + "className=".length);
  const value = rest.startsWith("{") ? braced(rest) : (/^(["'])([\s\S]*?)\1/.exec(rest)?.[2] ?? "");
  return value
    .replace(/["'`]/g, " ")
    .split(/[^\w-]+/)
    .filter((t) => /^[a-z]\w*(?:-|__)[\w-]*$/i.test(t));
}

function cssIndex(): Map<string, CssSize[]> {
  const index = new Map<string, CssSize[]>();
  for (const root of ROOTS) {
    for (const file of files(root, ".css")) {
      for (const [name, sizes] of cssClassSizes(readFileSync(file, "utf8"))) {
        index.set(name, [...(index.get(name) ?? []), ...sizes]);
      }
    }
  }
  return index;
}

function offenders() {
  const css = cssIndex();
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(root, ".tsx")) {
      if (EXEMPT.some((dir) => file.includes(dir))) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
        const start = m.index ?? 0;
        const tag = openingTag(src, start);
        if (NO_ZOOM_TYPES.test(tag)) continue;
        const line = src.slice(0, start).split("\n").length;
        for (const px of tagSizes(tag)) {
          if (px < 16) found.push(`${file}:${line} <${m[1]}> font-size ${px}px`);
        }
        for (const name of classNames(tag)) {
          const smallest = smallestSize(css.get(name));
          if (smallest && smallest.px < 16) {
            const where = smallest.media ? ` in ${smallest.media}` : "";
            found.push(`${file}:${line} <${m[1]}> .${name} is ${smallest.px}px${where}`);
          }
        }
      }
    }
  }
  return found;
}

describe("form controls never trigger the iOS auto-zoom", () => {
  it("has no input, textarea or select under 16px, at any width", () => {
    const bad = offenders();
    expect(
      bad,
      `These controls will zoom iOS in and never zoom back out. Give them 16px\n` +
        `at every width: an iPhone held sideways is 667-932px wide, past sm and md,\n` +
        `so a smaller size behind a breakpoint prefix zooms it too.\n\n` +
        bad.join("\n")
    ).toEqual([]);
  });

  it("the scanner actually detects an offender (so a green run means something)", () => {
    // Guards the guard: a regex that silently matches nothing would make the
    // test above pass forever.
    expect(
      tagSizes('<input className="w-full font-sans text-[15px] focus:outline-none" />')
    ).toEqual([15]);
    // A size behind a breakpoint counts: a landscape iPhone is past sm and md.
    expect(tagSizes('<input className="text-[16px] sm:text-[15px]" />')).toEqual([16, 15]);
    expect(tagSizes('<input className="text-base md:text-sm" />')).toEqual([16, 14]);
    // The placeholder's own size does not size what a reader types.
    expect(tagSizes('<input className="text-base placeholder:text-sm" />')).toEqual([16]);
  });

  it("reads past an arrow function to the className (the 30.09 blind spot)", () => {
    const src = `<input value={v} onChange={(e) => setV(e.target.value)} className="px-4 text-sm" />`;
    const tag = openingTag(src, 0);
    expect(tag).toContain('className="px-4 text-sm"');
    expect(tagSizes(tag)).toEqual([14]);
    // A ">" inside a string does not close the tag either.
    expect(openingTag(`<input placeholder="a > b" className="text-xs" />`, 0)).toContain("text-xs");
  });

  it("resolves a stylesheet class at every width, its smallest size the one that zooms", () => {
    const base = `.fb__box { width: 100%; font-size: 14px; }`;
    expect(smallestSize(cssClassSizes(base).get("fb__box"))?.px).toBe(14);
    // A 16px phone rule does not save a 14px base: a landscape iPhone at 844 gets it.
    const phoneOnly = `${base}\n@media (max-width: 767px) { .fb__panel { top: 0; } .fb__box { font-size: 16px; } }`;
    expect(smallestSize(cssClassSizes(phoneOnly).get("fb__box"))?.px).toBe(14);
    // Nor is a rule behind a min-width out of a phone's reach.
    const wide = `@media (min-width: 768px) { .fb__box { font-size: 14px; } }`;
    expect(smallestSize(cssClassSizes(wide).get("fb__box"))).toEqual({
      px: 14,
      media: "@media (min-width: 768px)",
    });
    const fixed = `.fb__box { font-size: 16px; }\n@media (min-width: 768px) { .fb__box { font-size: 16px; } }`;
    expect(smallestSize(cssClassSizes(fixed).get("fb__box"))?.px).toBe(16);
    // A placeholder rule does not size the control.
    expect(
      cssClassSizes(`.fb__box::placeholder { font-size: 12px; }`).get("fb__box")
    ).toBeUndefined();
    // The shorthand counts.
    expect(
      smallestSize(
        cssClassSizes(`.fb__box { font: 300 14px/22px var(--font-sans); }`).get("fb__box")
      )?.px
    ).toBe(14);
    expect(
      classNames(
        `<textarea className={\`report-fb__textarea \${big ? "is-big" : ""}\`} rows={3} />`
      )
    ).toEqual(["report-fb__textarea", "is-big"]);
  });
});
