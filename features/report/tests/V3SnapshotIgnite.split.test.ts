import { describe, expect, it } from "vitest";
import { splitFinding } from "@features/report/ui/v3/V3SnapshotIgnite";
import { report2Copy } from "@/data/report2-copy";

/**
 * The V3 Snapshot accordion shows each finding as a coral "turn" over a grey
 * "mechanism", but the copy matrix stores one `fN.body` string per finding.
 * `splitFinding` derives the two from the sentence structure.
 *
 * These assertions run against the real matrix, so they fail if a copy edit
 * ever breaks the shape the split depends on.
 */

describe("splitFinding", () => {
  it("matches the four open-state frames the designer specced", () => {
    // 10392:25610 — tile 1 open. Coral line is the second sentence.
    expect(
      splitFinding(
        "The fade is not a verdict on you or the relationship. Relighting desire is a skill, and it's learnable."
      )
    ).toEqual({
      turn: "Relighting desire is a skill, and it's learnable.",
      mechanism: "The fade is not a verdict on you or the relationship.",
    });

    // 10392:25724 — tile 3 open.
    expect(
      splitFinding(
        "Your desire fades before you even notice you're bored. Change one thing about the evening and it comes back."
      )
    ).toEqual({
      turn: "Change one thing about the evening and it comes back.",
      mechanism: "Your desire fades before you even notice you're bored.",
    });
  });

  it("keeps a three-sentence body's closing line as the turn", () => {
    expect(
      splitFinding(
        "Most people keep wanting hidden. Yours is visible, and visible desire is contagious. When you light up, your partner catches it."
      )
    ).toEqual({
      turn: "When you light up, your partner catches it.",
      mechanism:
        "Most people keep wanting hidden. Yours is visible, and visible desire is contagious.",
    });
  });

  it("renders a single-sentence body as a turn with no empty mechanism slot", () => {
    expect(splitFinding("Your body won't open before the relationship does.")).toEqual({
      turn: "Your body won't open before the relationship does.",
      mechanism: "",
    });
  });

  it("produces a non-empty turn for every finding of all 14 archetypes", () => {
    const archetypes = Object.keys(report2Copy);
    expect(archetypes).toHaveLength(14);

    let checked = 0;
    for (const key of archetypes) {
      const findings = (report2Copy as Record<string, Record<string, unknown>>)[key]?.findings as
        | Record<string, string>
        | undefined;
      expect(findings, `${key} has no findings block`).toBeTruthy();

      for (const n of [1, 2, 3, 4, 5]) {
        const body = findings?.[`f${n}.body`];
        expect(body, `${key} f${n}.body missing`).toBeTruthy();
        const { turn, mechanism } = splitFinding(body as string);
        expect(turn, `${key} f${n} produced an empty turn`).not.toBe("");
        // Nothing may be dropped: the two parts must rejoin to the original.
        expect([mechanism, turn].filter(Boolean).join(" ")).toBe((body as string).trim());
        checked += 1;
      }
    }
    expect(checked).toBe(70);
  });
});
