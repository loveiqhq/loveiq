import { describe, expect, it } from "vitest";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";

describe("reportPracticeTendencies", () => {
  it("contains structured intro, groups, scores, and explanations for every archetype", () => {
    expect(Object.keys(reportPracticeTendencies)).toHaveLength(14);

    for (const content of Object.values(reportPracticeTendencies)) {
      expect(content.introBlocks.length).toBeGreaterThan(8);
      expect(content.groups).toHaveLength(11);
      expect(content.groups.every((group) => group.rows.length > 0)).toBe(true);
      expect(
        content.groups.every((group) =>
          group.rows.every(
            (row) =>
              row.fantasyPull >= 1 &&
              row.fantasyPull <= 10 &&
              row.actualPleasure >= 1 &&
              row.actualPleasure <= 10 &&
              typeof row.description === "string" &&
              row.description.length > 20
          )
        )
      ).toBe(true);
    }
  });

  it("merges the updated Spark Seeker practice scores with the explanation source", () => {
    const sparkSeeker = reportPracticeTendencies["Spark Seeker"];
    const firstRow = sparkSeeker.groups[0]?.rows[0];

    expect(sparkSeeker.introBlocks[0]).toContain("probability-based estimates");
    expect(firstRow).toMatchObject({
      practice: "Romantic lovemaking",
      fantasyPull: 5,
      actualPleasure: 7,
    });
    expect(firstRow?.description).toContain(
      "feeling emotionally chosen. Organizes chemistry, freedom, and playful connection."
    );
  });
});
