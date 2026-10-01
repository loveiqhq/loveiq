import { describe, expect, it } from "vitest";
import { REPORT_V4_ACCELERATORS } from "@/data/report3-accelerators";
import { REPORT_V4_FANTASY } from "@/data/report3-fantasy";
import { REPORT_V4_PARTNERSHIP } from "@/data/report3-partnership";
import { REPORT_V4_TYPICAL_BELIEFS } from "@/data/report3-typical-beliefs";
import type { Report3Block } from "@/data/report3-learn-more";

/** Spark Seeker's chapter: hand-set from Figma, the record these tests read. */
const SPARK_TB = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;

/**
 * Sanjin, 01.10: "don't forget to update the copy at the end, since there were minor
 * adaptations in the Spark Seeker version as well". Each expectation below is his
 * Google Doc's text, read on 01.10:
 * - Spark_Seeker_Fantasy(vs)Reality_Chapter (29.09): "But", where the frame said "However,";
 * - Spark Seeker_loop (30.09): step 2 ends on a full stop, step 6 adds "pressured,";
 * - Spark_Seeker_Typical Beliefs_Chapter (29.09): the lede's two bold runs, and the two
 *   shadow beliefs that open "Common challenges" in bold italic;
 * - Spark_Seeker_Acc&Brakes_How_to_improve: Mark's resolved comment, "We need to have
 *   line breaks after the bold text", which his frame 374:323 misses on the fourth lead.
 */

const paraRuns = (block: Report3Block | undefined) => {
  expect(block?.kind).toBe("para");
  return block && block.kind === "para" ? block.runs : [];
};
const textOf = (block: Report3Block | undefined) =>
  paraRuns(block)
    .map((r) => r.text)
    .join("");

describe("Sanjin's Spark Seeker copy, 01.10", () => {
  it("opens Fantasy vs. Reality on 'But', not 'However,'", () => {
    const intro = REPORT_V4_FANTASY["Spark Seeker"]!.intro;
    expect(textOf(intro[0])).toContain("something you secretly want. But fantasy");
    expect(textOf(intro[0])).not.toContain("However");
  });

  it("sets the loop's two changed lines as the doc has them", () => {
    const loop = REPORT_V4_PARTNERSHIP["Spark Seeker"]!.loop;
    expect(loop[1]!.happens).toBe("“We have lost the spark.”");
    expect(loop[5]!.happens).toBe("I feel more pressured, confined and less energized");
  });

  it("bolds the belief map's lede as the doc does", () => {
    // [4] is the H2 "The Spark Seeker belief map"; [5] its lede.
    const runs = paraRuns(SPARK_TB.lede[1]);
    expect(runs.filter((r) => r.weight === 700).map((r) => r.text)).toEqual([
      "Spark Seeker",
      "chemistry, anticipation, play, novelty, and the feeling of being actively wanted",
    ]);
    expect(runs.map((r) => r.text).join("")).toBe(
      "The Spark Seeker tends to place unusual value on chemistry, anticipation, play, novelty, and the feeling of being actively wanted. These preferences can support a highly alive and exploratory sexuality. The difference between sun and shadow lies in what those experiences are allowed to mean."
    );
  });

  it("sets the two shadow beliefs that open the worked examples in bold italic", () => {
    const quoted = SPARK_TB.challenges
      .flatMap((block) =>
        block.kind === "para" ? block.runs.filter((r) => r.weight === 700 && r.italic) : []
      )
      .map((r) => r.text);
    expect(quoted).toEqual([
      "“If sex has to be planned, the spark must be gone.”",
      "“Being desired proves that I am still attractive and exciting.”",
    ]);
  });

  it("breaks the line after every bold lead in the A&B practice, the fourth too", () => {
    const practice = REPORT_V4_ACCELERATORS["Spark Seeker"]!.practice;
    for (const index of [0, 1, 2, 3]) {
      const runs = paraRuns(practice[index]);
      expect(runs[0]!.weight, `lead ${index + 1}`).toBe(700);
      expect(runs[1]!.text.startsWith(" \n"), `lead ${index + 1}`).toBe(true);
    }
  });
});
