import { describe, expect, it } from "vitest";

import { buildSurveyQuestions, runOrder } from "@features/admin/server/ap/survey";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import {
  assignQuestionOrderArm,
  QUESTION_ORDER_TEST_END,
} from "@shared/experiments/questionOrderArm";

const order = {
  control: askedQuestions(400, "control").map((q) => q.qId),
  variant: askedQuestions(400, "variant").map((q) => q.qId),
};

const run = (
  sessionId: string,
  reached: string[],
  startedAt = "2026-10-10T10:00:00Z"
): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});

describe("the opening-order test (C13) in the question funnel", () => {
  it("puts a run on the order its first questions follow", () => {
    const first = new Map([
      ["v", ["00001", "01002", "03011", "10005"]],
      ["c", ["00001", "01002", "01005", "01006"]],
      ["both", ["00001", "01002"]],
    ]);
    const during = Date.parse("2026-10-10T10:00:00Z");
    expect(runOrder("v", first, order, during)).toBe("variant");
    expect(runOrder("c", first, order, during)).toBe("control");
    // Left within the shared opening: the arm a fresh run is dealt.
    expect(runOrder("both", first, order, during)).toBe(assignQuestionOrderArm("both"));
    // Begun before the test: the survey's order.
    expect(runOrder("old", first, order, Date.parse("2026-10-01T10:00:00Z"))).toBe("control");
  });

  it("puts a run begun from the test's end on the new order, unless its questions say otherwise", () => {
    const end = Date.parse(QUESTION_ORDER_TEST_END);
    const first = new Map([
      ["both", ["00001", "01002"]],
      ["c", ["00001", "01002", "01005", "01006"]],
    ]);
    // A session that drew the old order, so only the end can make it the new one.
    const drewControl = ["both", "x1", "x2", "x3", "x4"].find(
      (id) => assignQuestionOrderArm(id) === "control"
    )!;
    first.set(drewControl, ["00001", "01002"]);
    expect(runOrder(drewControl, first, order, end - 1)).toBe("control");
    expect(runOrder(drewControl, first, order, end)).toBe("variant");
    // No steps to read: the new order from the end, the old one before the test.
    expect(runOrder("none", first, order, end)).toBe("variant");
    // A draft begun in the old order and resumed after the end still reads as the old order.
    expect(runOrder("c", first, order, end + 1)).toBe("control");
  });

  it("gives each order its own funnel, so question 6 never counts more than question 5", () => {
    // Two runs in each order, each leaving at its own sixth question.
    const control = order.control.slice(0, 6);
    const variant = order.variant.slice(0, 6);
    const q = buildSurveyQuestions(
      [run("c1", control), run("c2", control), run("v1", variant), run("v2", variant)],
      {
        steps: [],
        exits: [],
        orders: [
          { s: "c1", q: control },
          { s: "c2", q: control },
          { s: "v1", q: variant },
          { s: "v2", q: variant },
        ],
      },
      "2026-10-08",
      "2026-10-14",
      "All traffic",
      null
    );
    const reached = (rows: typeof q.rows) => rows.slice(0, 6).map((r) => r.reached);
    expect(reached(q.rows)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(q.test).not.toBeNull();
    expect(reached(q.test!.rows)).toEqual([2, 2, 2, 2, 2, 2]);
    // In one order the test's runs would have reached question 6 (02002) without question 5.
    expect(q.rows[5]!.id).toBe("02002");
    expect(q.test!.rows[6]!.id).toBe("02002");
  });

  it("counts a step lost in the background as passed, between the first and furthest reached", () => {
    const seen = order.control.slice(0, 8).filter((id, i) => i !== 4); // its 5th step was lost
    const q = buildSurveyQuestions(
      [run("a", seen), run("b", order.control.slice(0, 8))],
      { steps: [], exits: [] },
      "2026-10-08",
      "2026-10-14",
      "All traffic",
      null
    );
    expect(q.rows.slice(0, 8).map((r) => r.reached)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(q.test).toBeNull();
  });
});
