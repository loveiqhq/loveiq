import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * reportV3.css ships in the production build with its source map, comments and all, so
 * a comment that quotes a chapter's paid copy publishes it (the project's rule for
 * client code; CSS is client code). Final review, 29.09: a placement note quoted the
 * opening of a paid Typical Beliefs paragraph. Six words in a row from the paid modules
 * is a quote; a comment names a paragraph by its Figma node instead.
 */

const ROOT = join(__dirname, "..", "..", "..");
const PAID = [
  "report2-copy.ts",
  "report3-typical-beliefs.ts",
  "report3-accelerators.ts",
  "report3-partnership.ts",
  "report3-fantasy.ts",
  "report3-learn-more.ts",
];
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// The modules' own comments are not copy.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("reportV3.css comments", () => {
  it("quote none of the paid chapter copy", () => {
    const css = readFileSync(join(ROOT, "features/report/ui/v3/reportV3.css"), "utf8");
    const runs = (text: string) => {
      const words = norm(text).split(" ");
      return words
        .slice(0, Math.max(0, words.length - 5))
        .map((_, i) => words.slice(i, i + 6).join(" "));
    };
    const paid = new Set(
      PAID.flatMap((f) => runs(stripComments(readFileSync(join(ROOT, "data", f), "utf8"))))
    );
    const quoted = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].flatMap(([comment]) =>
      runs(comment).filter((run) => paid.has(run))
    );
    expect(quoted).toEqual([]);
  });
});
