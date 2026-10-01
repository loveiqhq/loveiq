import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Report3Run } from "@/data/report3-archetype-page";
import type { Report3ArchetypeCopy } from "@/data/report3-copy/types";
import type { Report3Block } from "@/data/report3-learn-more";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/**
 * Each archetype's file in data/report3-copy, transcribed from Sanjin's docs (01.10), on its
 * own: whole, in the shapes the chapters draw, and clean of the docs' markdown. Run per
 * archetype with `-t "<Archetype>"`. The merged records are checked again in
 * v4CopyArchetypes0110.test.ts.
 */
const DIR = join(process.cwd(), "data/report3-copy");
const FILES = readdirSync(DIR).filter(
  (f) => f.endsWith(".ts") && !["index.ts", "runs.ts", "types.ts"].includes(f)
);
const SLUG_TO_NAME = new Map(
  KNOWN_ARCHETYPES.map((name) => [name.toLowerCase().replace(/\s+/g, "-"), name])
);

const runsOf = (block: Report3Block): readonly Report3Run[] =>
  block.kind === "para" ? block.runs : block.kind === "list" ? block.items.flat() : [];
const textOf = (block: Report3Block | undefined): string =>
  !block
    ? ""
    : block.kind === "heading"
      ? block.text
      : runsOf(block)
          .map((r) => r.text)
          .join("");

/** Every block passage a file ships, by where it sits. */
function sections(copy: Report3ArchetypeCopy): [string, readonly Report3Block[] | undefined][] {
  const { typicalBeliefs: tb, accelerators: ab, partnership: cip, fantasy: fvr } = copy;
  return [
    ["tb.intro", tb.intro],
    ["tb.lede", tb.lede],
    ["tb.afterPanels", tb.afterPanels],
    ["tb.challenges", tb.challenges],
    ["tb.practice", tb.practice],
    ["ab.intro", ab.intro],
    ["ab.afterCards", ab.afterCards],
    ["ab.challenges", ab.challenges],
    ["ab.practice", ab.practice],
    ["cip.body", cip.body],
    ["cip.result", [cip.result]],
    ["cip.tail", cip.tail],
    ["cip.practice", cip.practice],
    ["fvr.intro", fvr.intro],
    ["fvr.challenges", fvr.challenges],
    ["fvr.practice", fvr.practice],
  ];
}

/** Every paragraph and list item a file ships, as its runs. */
function lines(copy: Report3ArchetypeCopy): { where: string; runs: readonly Report3Run[] }[] {
  return sections(copy).flatMap(([where, list]) =>
    (list ?? []).flatMap((block, i) =>
      block.kind === "para"
        ? [{ where: `${where}[${i}]`, runs: block.runs }]
        : block.kind === "list"
          ? block.items.map((runs, j) => ({ where: `${where}[${i}].${j}`, runs }))
          : []
    )
  );
}

/** Every string a file ships, with where it sits. */
function strings(copy: Report3ArchetypeCopy): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const [where, list] of sections(copy)) {
    (list ?? []).forEach((block, i) => {
      if (block.kind === "heading") out.push({ where: `${where}[${i}]`, text: block.text });
      else
        runsOf(block).forEach((run, j) =>
          out.push({ where: `${where}[${i}].${j}`, text: run.text })
        );
    });
  }
  const { typicalBeliefs: tb, accelerators: ab, partnership: cip } = copy;
  tb.turns.forEach((turn, i) => {
    out.push({ where: `turns[${i}].shadow`, text: turn.shadow });
    out.push({ where: `turns[${i}].shift`, text: turn.shift });
  });
  tb.sun.forEach((s, i) => out.push({ where: `sun[${i}]`, text: s }));
  if (ab.brakesLead !== undefined) out.push({ where: "ab.brakesLead", text: ab.brakesLead });
  if (ab.acceleratorsLead !== undefined)
    out.push({ where: "ab.acceleratorsLead", text: ab.acceleratorsLead });
  [...ab.brakes, ...ab.accelerators].forEach((row, i) => {
    out.push({ where: `ab.row[${i}].label`, text: row.label });
    out.push({ where: `ab.row[${i}].subtext`, text: row.subtext });
  });
  cip.loop.forEach((stage, i) => {
    out.push({ where: `cip.loop[${i}].happens`, text: stage.happens });
    out.push({ where: `cip.loop[${i}].underneath`, text: stage.underneath });
  });
  return out;
}

/** A run's weight and slant: what a reader sees change. */
const styleOf = (run: Report3Run) => `${run.weight ?? 400}${run.italic ? " italic" : ""}`;

describe("data/report3-copy", () => {
  it("holds one file per archetype, named by its slug, never Spark Seeker's", () => {
    for (const file of FILES) {
      const slug = file.replace(/\.ts$/, "");
      expect(SLUG_TO_NAME.has(slug), file).toBe(true);
      expect(slug).not.toBe("spark-seeker");
    }
  });
});

describe.each(FILES.map((f) => [SLUG_TO_NAME.get(f.replace(/\.ts$/, "")) ?? f, f] as const))(
  "%s (data/report3-copy/%s)",
  (_name, file) => {
    const load = async (): Promise<Report3ArchetypeCopy> => {
      const mod = (await import(`@/data/report3-copy/${file.replace(/\.ts$/, "")}`)) as Record<
        string,
        Report3ArchetypeCopy
      >;
      const values = Object.values(mod);
      expect(values, "exactly one export").toHaveLength(1);
      return values[0]!;
    };

    it("is whole: ten turns and sun beliefs, five and five rows, six loop steps", async () => {
      const copy = await load();
      expect(copy.typicalBeliefs.turns).toHaveLength(10);
      expect(copy.typicalBeliefs.sun).toHaveLength(10);
      expect(copy.typicalBeliefs.lede.length).toBeGreaterThanOrEqual(2);
      expect(copy.typicalBeliefs.lede[0]).toMatchObject({ kind: "heading", level: 2 });
      expect(copy.accelerators.brakes).toHaveLength(5);
      expect(copy.accelerators.accelerators).toHaveLength(5);
      expect(copy.partnership.loop).toHaveLength(6);
      for (const list of [
        copy.typicalBeliefs.challenges,
        copy.typicalBeliefs.practice,
        copy.accelerators.intro,
        copy.accelerators.challenges,
        copy.accelerators.practice,
        copy.partnership.body,
        copy.partnership.practice,
        copy.fantasy.intro,
        copy.fantasy.challenges,
        copy.fantasy.practice,
      ]) {
        expect(list.length).toBeGreaterThan(0);
      }
      expect(copy.fantasy.challenges[0]).toEqual({ kind: "heading", text: "Common challenges" });
      expect(
        copy.partnership.body.some((b) => b.kind === "heading" && b.text === "Common challenges")
      ).toBe(true);
    });

    it("cuts every wall inside its section, a ramp anchor inside its paragraph", async () => {
      const copy = await load();
      const tb = copy.typicalBeliefs.cuts ?? {};
      if (tb.challengesFree !== undefined)
        expect(tb.challengesFree).toBeLessThan(copy.typicalBeliefs.challenges.length);
      if (tb.practiceFree !== undefined)
        expect(tb.practiceFree).toBeLessThan(copy.typicalBeliefs.practice.length);
      const ab = copy.accelerators.cuts ?? {};
      if (ab.challengesFree !== undefined)
        expect(ab.challengesFree).toBeLessThan(copy.accelerators.challenges.length);
      if (ab.practiceFree !== undefined) {
        expect(ab.practiceFree).toBeLessThan(copy.accelerators.practice.length);
        // Spark Seeker's default anchor is Spark Seeker's text: another archetype states its own.
        expect(ab.practiceRampThrough, "practiceRampThrough (null for none)").not.toBeUndefined();
        if (ab.practiceRampThrough)
          expect(textOf(copy.accelerators.practice[ab.practiceFree])).toContain(
            ab.practiceRampThrough
          );
      }
      const cip = copy.partnership.cuts ?? {};
      if (cip.freeBlocks !== undefined) {
        expect(cip.freeBlocks).toBeLessThan(copy.partnership.body.length);
        expect(cip.rampThrough, "rampThrough (null for none)").not.toBeUndefined();
        if (cip.rampThrough)
          expect(textOf(copy.partnership.body[cip.freeBlocks])).toContain(cip.rampThrough);
      }
      if (cip.practiceFree !== undefined)
        expect(cip.practiceFree).toBeLessThan(copy.partnership.practice.length);
      const fvr = copy.fantasy.cuts ?? {};
      if (fvr.practiceFree !== undefined)
        expect(fvr.practiceFree).toBeLessThan(copy.fantasy.practice.length);
    });

    it("carries the docs' words clean: curly quotes, single spaces, no markdown", async () => {
      const copy = await load();
      for (const { where, text } of strings(copy)) {
        expect(text, where).not.toMatch(/["']/);
        expect(text, where).not.toMatch(/ {2}/);
        expect(text, where).not.toMatch(/\*|\\|\[VISUALS\]|<comment|^#/);
        expect(text.trim(), where).not.toBe("");
      }
      for (const turn of copy.typicalBeliefs.turns) {
        expect(turn.shadow).toMatch(/^“.*”$/);
        expect(turn.shift).toMatch(/^“.*”$/);
        expect(turn.shift).not.toMatch(/^“Shift/);
      }
      for (const sun of copy.typicalBeliefs.sun) expect(sun).toMatch(/^“.*”$/);
    });

    // The slips the 01.10 transcription met in the docs themselves: a paragraph that was
    // only ".", a sentence run into the next ("meaning.Start"), and bold that starts one
    // letter into a word ("A" then "nalysis").
    it("reads as a reader should see it: no stray paragraph, no run-on, no style mid-word", async () => {
      const copy = await load();
      for (const { where, runs } of lines(copy)) {
        const text = runs.map((run) => run.text).join("");
        expect(text, where).toMatch(/[A-Za-z]/);
        expect(text, where).not.toMatch(/[a-z0-9’”)][.!?;:,][A-Z“]/);
        runs.slice(1).forEach((run, k) => {
          const before = runs[k]!;
          const inWord = /[A-Za-z’]$/.test(before.text) && /^[A-Za-z]/.test(run.text);
          expect(inWord && styleOf(before) !== styleOf(run), `${where}.${k + 1}`).toBe(false);
        });
      }
    });
  }
);
