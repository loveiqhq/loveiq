import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Postgres compiles a CHECK's regular expression only when a row is written, and refuses a
 * repetition count above 255 ("invalid regular expression: invalid repetition count(s)", 2201B).
 * Such a CHECK applies cleanly and then rejects every insert, which tests against a fake database
 * never see (22 Nov 2026: every Mira passkey save failed on staging). Lengths above 255 belong in
 * char_length(), with the pattern unbounded.
 */
const DIR = path.join(process.cwd(), "supabase", "migrations");
const DUPMAX = 255;

describe("migrations' regular expressions", () => {
  it("never repeat more than Postgres allows", () => {
    const over: string[] = [];
    for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql"))) {
      readFileSync(path.join(DIR, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/~|regexp|SIMILAR TO/i.test(line)) return;
          for (const m of line.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
            if (Number(m[1]) > DUPMAX || (m[2] && Number(m[2]) > DUPMAX)) {
              over.push(`${file}:${i + 1} ${m[0]}`);
            }
          }
        });
    }
    expect(over).toEqual([]);
  });
});
