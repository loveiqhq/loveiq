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
 * Only the UNPREFIXED size matters: `sm:text-[15px]` applies above the mobile
 * breakpoint, where no auto-zoom exists, so a smaller desktop size is fine.
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
 * against the stylesheets, a phone-width rule winning over the base rule.
 *
 * The admin is left out: an internal desktop tool, 200+ controls at 12-14px.
 */
const NAMED: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
const ROOTS = ["features", "shared", "app"];
const EXEMPT = [`features${sep}admin${sep}`, `app${sep}admin${sep}`];
/** iOS zooms only the controls a reader types into or picks from. */
const NO_ZOOM_TYPES =
  /\btype=["'](?:checkbox|radio|range|hidden|file|color|submit|button|reset|image)["']/;
/** From this min-width up the layout is not a phone's, so no auto-zoom (Tailwind's sm). */
const PHONE_MAX = 640;

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

/** Unprefixed Tailwind sizes and an inline `fontSize` on a tag, in px. */
export function tagSizes(tag: string): number[] {
  // `(?<![:\w-])` keeps `sm:text-sm` / `md:text-[14px]` out — those only apply
  // above the mobile breakpoint.
  const arbitrary = [...tag.matchAll(/(?<![:\w-])text-\[(\d+(?:\.\d+)?)px\]/g)].map((x) =>
    parseFloat(x[1]!)
  );
  const named = [...tag.matchAll(/(?<![:\w-])text-(xs|sm|base|lg|xl)\b/g)].map(
    (x) => NAMED[x[1]!]!
  );
  const inline = [...tag.matchAll(/fontSize:\s*["'`]?(\d+(?:\.\d+)?)(px|rem|em|%)?/g)]
    .filter((x) => x[2] !== "em" && x[2] !== "%")
    .map((x) => parseFloat(x[1]!) * (x[2] === "rem" ? 16 : 1));
  return [...arbitrary, ...named, ...inline];
}

interface CssSize {
  px: number;
  /** Inside a max-width media query: the phone's own rule. */
  phoneRule: boolean;
}

const FONT_SIZE = /(?:^|;)\s*font-size:\s*(\d+(?:\.\d+)?)(px|rem)\b/;
const FONT_SHORTHAND = /(?:^|;)\s*font:\s*(?:[a-z-]+\s+|\d{3}\s+)*(\d+(?:\.\d+)?)(px|rem)\b/;

/**
 * Every class whose own rule sets a font-size a phone gets, from CSS source:
 * `.a { font-size: 14px }` and `.b .a { … }` both size `.a`. Rules behind a
 * min-width of 640px or more are desktop-only and skipped; rules on a pseudo-class
 * or pseudo-element (`:focus`, `::placeholder`) are skipped too.
 */
export function cssClassSizes(css: string): Map<string, CssSize[]> {
  const out = new Map<string, CssSize[]>();
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: { desktop: boolean; phone: boolean; depth: number }[] = [];
  let depth = 0;
  let prelude = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "{") {
      const head = prelude.trim();
      prelude = "";
      depth++;
      if (head.startsWith("@")) {
        const minWidth = /min-width:\s*(\d+)px/.exec(head);
        blocks.push({
          desktop: !!minWidth && Number(minWidth[1]) >= PHONE_MAX,
          phone: /max-width/.test(head),
          depth,
        });
        continue;
      }
      const close = src.indexOf("}", i);
      const body = src.slice(i + 1, close);
      i = close;
      depth--;
      const size = FONT_SIZE.exec(body) ?? FONT_SHORTHAND.exec(body);
      if (!size || blocks.some((b) => b.desktop)) continue;
      const px = parseFloat(size[1]!) * (size[2] === "rem" ? 16 : 1);
      const phoneRule = blocks.some((b) => b.phone);
      for (const selector of head.split(",")) {
        const last =
          selector
            .trim()
            .split(/[\s>+~]+/)
            .pop() ?? "";
        if (last.includes(":")) continue;
        for (const cls of last.match(/\.[\w-]+/g) ?? []) {
          const name = cls.slice(1);
          out.set(name, [...(out.get(name) ?? []), { px, phoneRule }]);
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

/** What a phone renders a class at: its last phone rule, else its last base rule. */
export function phoneSize(sizes: CssSize[] | undefined): number | null {
  if (!sizes?.length) return null;
  const phone = sizes.filter((s) => s.phoneRule);
  const rules = phone.length ? phone : sizes;
  return rules[rules.length - 1]!.px;
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
          const px = phoneSize(css.get(name));
          if (px !== null && px < 16) {
            found.push(`${file}:${line} <${m[1]}> .${name} is ${px}px on a phone`);
          }
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
        `  text-[16px] sm:text-[15px]\n` +
        `or, for a stylesheet class, a 16px rule in a max-width media query.\n\n` +
        bad.join("\n")
    ).toEqual([]);
  });

  it("the scanner actually detects an offender (so a green run means something)", () => {
    // Guards the guard: a regex that silently matches nothing would make the
    // test above pass forever.
    expect(
      tagSizes('<input className="w-full font-sans text-[15px] focus:outline-none" />')
    ).toEqual([15]);
    // the sm: one must NOT be picked up
    expect(tagSizes('<input className="text-[16px] sm:text-[15px]" />')).toEqual([16]);
  });

  it("reads past an arrow function to the className (the 30.09 blind spot)", () => {
    const src = `<input value={v} onChange={(e) => setV(e.target.value)} className="px-4 text-sm" />`;
    const tag = openingTag(src, 0);
    expect(tag).toContain('className="px-4 text-sm"');
    expect(tagSizes(tag)).toEqual([14]);
    // A ">" inside a string does not close the tag either.
    expect(openingTag(`<input placeholder="a > b" className="text-xs" />`, 0)).toContain("text-xs");
  });

  it("resolves a stylesheet class, a phone rule winning over the base rule", () => {
    const base = `.fb__box { width: 100%; font-size: 14px; }`;
    expect(phoneSize(cssClassSizes(base).get("fb__box"))).toBe(14);
    const fixed = `${base}\n@media (max-width: 767px) { .fb__panel { top: 0; } .fb__box { font-size: 16px; } }`;
    expect(phoneSize(cssClassSizes(fixed).get("fb__box"))).toBe(16);
    // A desktop-only rule is not what a phone gets.
    const desktop = `@media (min-width: 768px) { .fb__box { font-size: 14px; } }`;
    expect(phoneSize(cssClassSizes(desktop).get("fb__box"))).toBeNull();
    // A placeholder rule does not size the control.
    expect(
      cssClassSizes(`.fb__box::placeholder { font-size: 12px; }`).get("fb__box")
    ).toBeUndefined();
    // The shorthand counts.
    expect(
      phoneSize(cssClassSizes(`.fb__box { font: 300 14px/22px var(--font-sans); }`).get("fb__box"))
    ).toBe(14);
    expect(
      classNames(
        `<textarea className={\`report-fb__textarea \${big ? "is-big" : ""}\`} rows={3} />`
      )
    ).toEqual(["report-fb__textarea", "is-big"]);
  });
});
