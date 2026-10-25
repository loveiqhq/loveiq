import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fillRange } from "@features/admin/ui/ap/field-info";
import { FIELDS } from "@features/admin/ui/ap/fields";

const ROOT = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(ROOT, dir, f));

/** Every field key written out in AP's pages and builders. */
function keysInSource(): Set<string> {
  const keys = new Set<string>();
  const pattern =
    /(?:\bk=|\binfo=|\binfo:\s*|\binfoKey:\s*|\bk:\s*)["'`]([a-z]+\.[A-Za-z0-9_.-]+)["'`]/g;
  for (const f of [...files("ui/ap"), ...files("server/ap")]) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(pattern)) keys.add(m[1]!);
  }
  return keys;
}

describe("the field info cards", () => {
  it("define every field a page names", () => {
    const missing = [...keysInSource()].filter((k) => !FIELDS[k]);
    expect(missing).toEqual([]);
  });

  it("leave the team out as the pages do: its accounts from ap_team_user, never by address alone", () => {
    // An @loveiq.org address or the team's 100% test code (Eman, 24 Oct 2026); a buyer's own
    // address (customer_email) is all a checkout without an account has.
    const byAddress = Object.entries(FIELDS)
      .filter(
        ([, d]) => d.query.lang === "SQL" && /(?<!customer_)email ~\* '@loveiq/.test(d.query.text)
      )
      .map(([k]) => k);
    expect(byAddress).toEqual([]);
    const team = Object.values(FIELDS).filter((d) => /\bap_team_user\b/.test(d.query.text));
    expect(team.length).toBeGreaterThan(40);
  });

  it("say what each field means, how it is counted, its formula, its tables and its query", () => {
    for (const [k, d] of Object.entries(FIELDS)) {
      const where = `${k}: `;
      expect(where + d.label.trim()).not.toBe(where);
      expect(d.what.length, where + "what").toBeGreaterThan(20);
      expect(d.stat.trim(), where + "stat").not.toBe("");
      expect(d.per.trim(), where + "per").not.toBe("");
      expect(d.formula.num.trim(), where + "formula").not.toBe("");
      expect(d.tables.length, where + "tables").toBeGreaterThan(0);
      for (const t of d.tables) {
        expect(t.columns.trim(), where + t.table).not.toBe("");
        expect(t.filters.trim(), where + t.table).not.toBe("");
      }
      expect(d.query.text.trim().length, where + "query").toBeGreaterThan(20);
      for (const r of d.related ?? []) expect(FIELDS[r], `${k} → ${r}`).toBeDefined();
    }
  });

  it("name each table once", () => {
    for (const [k, d] of Object.entries(FIELDS)) {
      const names = d.tables.map((t) => `${t.source}.${t.table}`);
      expect(names.length, k).toBe(new Set(names).size);
    }
  });

  it("write the range into a query as its language takes a day", () => {
    const fill = (text: string, lang: "SQL" | "HogQL" | "GAQL") =>
      fillRange(text, "2026-09-21", "2026-10-20", lang, ["a1", "b2"]);
    expect(fill("day between :from and :to and (date :to) + 1", "SQL")).toBe(
      "day between DATE '2026-09-21' and DATE '2026-10-20' and (date '2026-10-20') + 1"
    );
    expect(
      fill("toDateTime(:from, 'Europe/Berlin') AND $session_id IN :team_visits", "HogQL")
    ).toBe("toDateTime('2026-09-21', 'Europe/Berlin') AND $session_id IN ('a1', 'b2')");
    expect(fill("segments.date BETWEEN :from AND :to", "GAQL")).toBe(
      "segments.date BETWEEN '2026-09-21' AND '2026-10-20'"
    );
    expect(fill("toDateTime(':from 00:00:00', 'Europe/Berlin')", "HogQL")).toBe(
      "toDateTime('2026-09-21 00:00:00', 'Europe/Berlin')"
    );
    // A query in parts fills each in its own language; no team visits is an empty list.
    expect(
      fillRange(
        "-- Part 1, production (SQL): a\nday = :from;\n-- Part 2, PostHog (HogQL): b\nd = :from AND s IN :team_visits",
        "2026-09-21",
        "2026-10-20"
      )
    ).toBe(
      "-- Part 1, production (SQL): a\nday = DATE '2026-09-21';\n-- Part 2, PostHog (HogQL): b\nd = '2026-09-21' AND s IN ('')"
    );
  });

  it("leave nothing in a query for the reader to fill in, but part 1's result", () => {
    for (const [k, d] of Object.entries(FIELDS)) {
      const left = fillRange(d.query.text, "2026-09-21", "2026-10-20", d.query.lang).match(
        /(?<![:\w]):[a-z_]{2,}\b/g
      );
      // Its part 2 reads the visits part 1 returns (production's, which PostHog can't read).
      expect([...new Set(left)], k).toEqual(k === "assessment.nr-per-visit" ? [":visits"] : []);
    }
  });

  it("never print a person's address or a secret in a query", () => {
    for (const [k, d] of Object.entries(FIELDS)) {
      expect(d.query.text, k).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
      expect(d.query.text, k).not.toMatch(/sk_live|sk_test|whsec_|eyJhbGci/);
    }
  });
});
