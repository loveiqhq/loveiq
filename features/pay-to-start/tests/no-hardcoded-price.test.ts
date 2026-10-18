import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The pay-to-start pages print one price, the server's (PAY_TO_START_PRICE_CENTS). A "€"
 * written next to a digit in their source is a price that a change of that setting would
 * leave behind, and the visitor would be shown one thing and charged another.
 */
const ROOTS = ["features/pay-to-start/ui", "app/sexual-archetype"];
const EURO_AMOUNT = /€\s?\d/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("pay-to-start prices", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)));

  it("finds the files it guards", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => [path.relative(process.cwd(), file), file]))(
    "%s writes no price of its own",
    (_name, file) => {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line: i + 1, text: line }))
        .filter(({ text }) => EURO_AMOUNT.test(text));
      expect(offending).toEqual([]);
    }
  );
});
