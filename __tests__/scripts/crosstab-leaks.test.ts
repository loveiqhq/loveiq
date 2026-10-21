import { describe, expect, it } from "vitest";
import { countsFor, crosstabLeaks, type Crosstab } from "../../scripts/crosstab-leaks";

/** A single-choice row question, so each person is in one row, with one scale and one single-choice column. */
function table(): Crosstab {
  return {
    row_question: { q: "15004", type: "single" },
    people: 60,
    columns: [
      { q: "01002", type: "scale" },
      { q: "15006", type: "single" },
    ],
    rows: [
      {
        answer: "(all)",
        people: 60,
        cols: [
          { q: "01002", n: 60, mean: 3.9, pct_5_7: 40 },
          { q: "15006", n: 60, pct: { "1": 50, "2": 50 } },
        ],
      },
      {
        answer: "Single",
        people: 30,
        cols: [
          { q: "01002", n: 30, mean: 3.5, pct_5_7: 30 },
          { q: "15006", n: 30, pct: { "1": 50, "2": 50 } },
        ],
      },
      {
        answer: "Monogamous",
        people: 30,
        cols: [
          { q: "01002", n: 30, mean: 4.3, pct_5_7: 50 },
          { q: "15006", n: 30, pct: { "1": 50, "2": 50 } },
        ],
      },
    ],
  };
}

describe("crosstabLeaks: the attacker's view of get_answer_crosstab", () => {
  it("finds nothing in a table that keeps every rule", () => {
    expect(crosstabLeaks(table())).toEqual([]);
  });

  it("reads a share as every count it can stand for, so rounding alone is no leak", () => {
    expect(countsFor(1, 663)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(countsFor(0.4, 1250)).toEqual([5]);
    const t = table();
    t.rows![1]!.cols[1]!.pct = { "1": 10, "2": 90 }; // 10% of 30 is 3 people
    expect(crosstabLeaks(t)).toContain("/Single/15006/1: 10% of 30 is 3");
  });

  it("flags a row under 5", () => {
    const t = table();
    t.rows![1]!.people = 4;
    expect(crosstabLeaks(t)).toContain("/Single: 4 people");
  });

  it("flags a lone hidden share in a single-choice column, which 100% minus the others gives back", () => {
    const t = table();
    t.rows![2]!.cols[1]!.pct = { "1": "<5", "2": 50 };
    expect(crosstabLeaks(t)).toEqual([
      "/Monogamous/15006: one hidden share, so 100% minus the others",
    ]);
  });

  it("flags a mean of under 20 answers", () => {
    const t = table();
    t.rows![1]!.cols[0]!.n = 12;
    t.rows![1]!.people = 12;
    expect(crosstabLeaks(t)).toContain("/Single/01002: a mean of under 20 answers");
  });

  it("flags figures beside an n that is not exact: rounded shares and a mean pin it down", () => {
    // A mean of 4.13 over 28, 29 or 30 answers fits only 30: so 0 of a row of 30 did not answer.
    const t = table();
    t.rows![1]!.cols[0] = { q: "01002", n: "all but <5", mean: 4.13, pct_5_7: 30 };
    expect(crosstabLeaks(t)).toContain('/Single/01002: figures beside an n of "all but <5"');
    t.rows![1]!.cols[0] = { q: "01002", n: "all but <5" };
    expect(crosstabLeaks(t)).toEqual([]);
  });

  it("flags what (all) minus the shown rows gives back, where each person is in one row", () => {
    const t = table();
    t.rows![0]!.people = 63; // 3 people in rows not shown
    t.rows![0]!.cols[0]!.n = 63;
    t.rows![0]!.cols[1]!.n = 63;
    t.rows![0]!.cols[1]!.pct = { "1": 52, "2": 48 }; // 33 of 63: the 3 left all chose 1
    t.people = 63;
    const leaks = crosstabLeaks(t);
    expect(leaks).toContain(": the hidden rows hold 3");
    expect(leaks).toContain("/(all)/15006/1: the 3 left hold 3 to 3");
    expect(leaks).toContain("/(all)/01002: the mean minus the shown means leaves 3 answers");
  });

  it("does not subtract rows that overlap: a multiple-choice row question puts people in several", () => {
    const t = table();
    t.row_question.type = "multiple";
    t.rows![0]!.people = 63;
    t.rows![0]!.cols[0]!.n = 63;
    t.rows![0]!.cols[1] = { q: "15006", n: 63, pct: { "1": 51, "2": 49 } };
    t.people = 63;
    expect(crosstabLeaks(t)).toEqual([]);
    // The same numbers with each person in one row give the 3 left over away.
    t.row_question.type = "single";
    expect(crosstabLeaks(t)).toContain(": the hidden rows hold 3");
  });

  it("checks the group_by values hidden against the people the table says it holds", () => {
    const t = table();
    for (const r of t.rows!) r.group = "Woman";
    t.people = 63;
    t.people_in_hidden_groups = 3;
    expect(crosstabLeaks(t)).toContain("the hidden group_by values hold 3");
    t.people_in_hidden_groups = undefined;
    expect(crosstabLeaks(t)).toContain("people minus the shown groups is 3, not 0");
  });

  it("passes refusals and needs a rows array", () => {
    expect(crosstabLeaks({ ...table(), error: "Fewer than 5 people match" })).toEqual([]);
    expect(crosstabLeaks({ ...table(), rows: undefined })).toEqual(["no rows array"]);
  });
});
