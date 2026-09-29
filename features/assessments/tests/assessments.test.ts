/**
 * The Assessment Factory (features/assessments): every instrument passes the automated gate,
 * scores exactly as its manual says at every band edge, and routes to safety before anything
 * else. The gate itself is tested against broken definitions, one defect at a time.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { INSTRUMENTS, instrument } from "@features/assessments/instruments";
import { checkInstrument, reachableTotals } from "@features/assessments/logic/check";
import {
  helpFor,
  scoreInstrument,
  reviewHash,
  scoreRange,
  type Answers,
} from "@features/assessments/logic/score";
import { standardSignOff } from "@features/assessments/logic/signoff";
import type { InstrumentDefinition } from "@features/assessments/logic/types";

const def = (id: string) => instrument(id)!;

/** Answers that add up to `above` more than the minimum, filling scored items in order. */
function answersFor(d: InstrumentDefinition, above: number): Answers {
  const out: Answers = {};
  let left = above;
  for (const item of d.items) {
    const values = (item.options ?? d.scale).map((o) => o.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (item.unscored) {
      out[item.id] = lo;
      continue;
    }
    const v = Math.min(hi, lo + left);
    out[item.id] = v;
    left -= v - lo;
  }
  return out;
}

describe("every instrument in the factory", () => {
  it.each(INSTRUMENTS.map((d) => [d.shortName, d]))("%s passes the automated gate", (_, d) => {
    expect(checkInstrument(d)).toEqual([]);
  });

  it("is registered, every one: a definition file left out of the registry is never checked", () => {
    const dir = join(__dirname, "..", "instruments");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
    expect(files.map((f) => f.replace(/\.ts$/, "")).sort()).toEqual(
      INSTRUMENTS.map((d) => d.id).sort()
    );
  });

  it("has unique ids, and item ids that name their instrument", () => {
    expect(new Set(INSTRUMENTS.map((d) => d.id)).size).toBe(INSTRUMENTS.length);
    for (const d of INSTRUMENTS) {
      for (const i of d.items) expect(i.id.startsWith(`${d.id}_`)).toBe(true);
    }
  });

  /**
   * WHAT WAS SIGNED, PINNED. A change to anything the sign-off covers (the wording, answers,
   * scoring, bands, our copy, the safety routing, the license) changes the fingerprint, and
   * this fails until it is updated here on purpose, which is the moment to ask Mark and
   * Sanjin to sign again. Dropping "in some way" from PHQ-9's item 9, or a digit from a
   * crisis line, would otherwise pass every other test.
   */
  it.each([
    ["gad7", "ca077e97a4a2d2b7"],
    ["phq9", "a38a3e3655c255a1"],
    ["ucla3", "e012a9c769e9dbaa"],
  ])("%s has the fingerprint it was checked at", (id, hash) => {
    expect(reviewHash(def(id))).toBe(hash);
  });
});

describe("scores as the manuals say", () => {
  const edges: Array<[string, Array<[number, string]>]> = [
    [
      "gad7",
      [
        [0, "Minimal"],
        [4, "Minimal"],
        [5, "Mild"],
        [9, "Mild"],
        [10, "Moderate"],
        [14, "Moderate"],
        [15, "Severe"],
        [21, "Severe"],
      ],
    ],
    [
      "phq9",
      [
        [0, "None-minimal"],
        [4, "None-minimal"],
        [5, "Mild"],
        [9, "Mild"],
        [10, "Moderate"],
        [14, "Moderate"],
        [15, "Moderately Severe"],
        [19, "Moderately Severe"],
        [20, "Severe"],
        [27, "Severe"],
      ],
    ],
    [
      "ucla3",
      [
        [3, "Lonely less often"],
        [5, "Lonely less often"],
        [6, "Lonely more often"],
        [9, "Lonely more often"],
      ],
    ],
  ];
  it.each(edges)("%s puts every band edge in the right band", (id, cases) => {
    for (const [total, label] of cases) {
      const r = scoreInstrument(def(id), answersFor(def(id), total - scoreRange(def(id))[0]));
      expect(r.ok && [r.total, r.band.label]).toEqual([total, label]);
    }
  });

  it("uses the published ranges", () => {
    expect(scoreRange(def("gad7"))).toEqual([0, 21]);
    expect(scoreRange(def("phq9"))).toEqual([0, 27]);
    expect(scoreRange(def("ucla3"))).toEqual([3, 9]);
  });

  it("leaves the difficulty question out of the total, and lets it be skipped", () => {
    const a = answersFor(def("phq9"), 0);
    const low = scoreInstrument(def("phq9"), { ...a, phq9_difficulty: 0 });
    const high = scoreInstrument(def("phq9"), { ...a, phq9_difficulty: 3 });
    expect(low.ok && high.ok && low.total === high.total).toBe(true);
    const { phq9_difficulty: _, ...withoutIt } = a;
    expect(scoreInstrument(def("phq9"), withoutIt).ok).toBe(true);
  });

  it("refuses a sheet with a question missing, an answer that is not an option, or a key it does not know", () => {
    const a = answersFor(def("phq9"), 3);
    const { phq9_4: _, ...missing } = a;
    expect(scoreInstrument(def("phq9"), missing)).toEqual({
      ok: false,
      missing: ["phq9_4"],
      invalid: [],
      safety: [],
    });
    expect(scoreInstrument(def("phq9"), { ...a, phq9_2: 7 })).toEqual({
      ok: false,
      missing: [],
      invalid: ["phq9_2"],
      safety: [],
    });
    expect(scoreInstrument(def("phq9"), { ...a, phq9_22: 1 })).toMatchObject({
      ok: false,
      invalid: ["phq9_22"],
    });
  });
});

describe("PHQ-9's item 9", () => {
  const withItem9 = (v: number) => ({ ...answersFor(def("phq9"), 0), phq9_9: v });

  it("triggers safety routing at 'Several days' or more, whatever the total, and replaces the next step", () => {
    const r = scoreInstrument(def("phq9"), withItem9(3));
    expect(r.ok && r.total).toBe(3);
    expect(r.ok && r.band.label).toBe("None-minimal");
    expect(r.safety.map((s) => s.item)).toEqual(["phq9_9"]);
    // "You can carry on as you are" must never sit beside a crisis message.
    expect(r.ok && r.nextStep).toBe(def("phq9").safety![0]!.nextStep);
    expect(r.ok && r.nextStep).not.toBe(r.ok && r.band.nextStep);
  });

  it("still routes to help when the sheet is incomplete or an answer is off the scale", () => {
    const { phq9_4: _, ...incomplete } = withItem9(2);
    const r = scoreInstrument(def("phq9"), incomplete);
    expect(r.ok).toBe(false);
    expect(r.safety.map((s) => s.item)).toEqual(["phq9_9"]);
    const off = scoreInstrument(def("phq9"), withItem9(5));
    expect(off.ok === false && off.invalid).toEqual(["phq9_9"]);
    expect(off.safety.map((s) => s.item)).toEqual(["phq9_9"]);
  });

  it("stays quiet at 'Not at all', and the band's own next step stands", () => {
    const r = scoreInstrument(def("phq9"), withItem9(0));
    expect(r.safety).toEqual([]);
    expect(r.ok && r.nextStep).toBe(r.ok && r.band.nextStep);
  });

  it("gives each country its own help lines, and everyone else the fallback", () => {
    const rule = def("phq9").safety![0]!;
    expect(helpFor(rule, "ca").lines.join(" ")).toContain("988");
    expect(helpFor(rule, "GB").lines.join(" ")).toContain("999");
    expect(helpFor(rule, "AU").lines.join(" ")).toContain("13 11 14");
    expect(helpFor(rule, "BA").region).toBe("ANY");
    expect(helpFor(rule, null).lines.join(" ")).toContain("findahelpline.com");
  });
});

describe("the gate catches a broken definition", () => {
  const broken = (change: (d: InstrumentDefinition) => void, base = def("gad7")) => {
    const d = structuredClone(base) as InstrumentDefinition;
    change(d);
    return checkInstrument(d).map((p) => `${p.area}: ${p.message}`);
  };

  it("a total that falls in no band, or in two", () => {
    expect(broken((d) => void (d.bands[1]!.max = 8))).toContain(
      "bands: a total of 9 falls in no band"
    );
    expect(broken((d) => void (d.bands[1]!.max = 10))).toContain(
      "bands: a total of 10 falls in Mild and Moderate"
    );
  });

  it("a band nobody can reach", () => {
    expect(
      broken((d) => void d.bands.push({ ...d.bands[3]!, min: 22, max: 30, label: "Beyond" }))
    ).toContain("bands: nobody can score Beyond");
  });

  it("a reversed item whose answers are not symmetric", () => {
    const problems = broken((d) => {
      d.items[0]!.reverse = true;
      d.items[0]!.options = [
        { value: 0, label: "a" },
        { value: 1, label: "b" },
        { value: 3, label: "c" },
      ];
    });
    expect(problems).toContain(
      "items: gad7_1 is reversed, but its answer values are not symmetric"
    );
  });

  const rule = (over = {}) => ({
    item: "gad7_1",
    atLeast: 1,
    message: "Please get help.",
    nextStep: "Talk to a doctor soon.",
    resources: [{ region: "ANY", lines: ["Your local emergency number"] }],
    ...over,
  });

  it("a safety rule on no item, one that never or always triggers, or with no fallback help", () => {
    expect(broken((d) => void (d.safety = [rule({ item: "gad7_9" })]))).toContain(
      "safety: a safety rule watches gad7_9, which is not an item"
    );
    expect(broken((d) => void (d.safety = [rule({ atLeast: 4 })]))).toContain(
      "safety: the safety rule on gad7_1 can never trigger"
    );
    expect(broken((d) => void (d.safety = [rule({ atLeast: 0 })]))).toContain(
      "safety: the safety rule on gad7_1 triggers on every answer"
    );
    expect(
      broken((d) => void (d.safety = [rule({ resources: [{ region: "US", lines: ["911"] }] })]))
    ).toContain("safety: the safety rule on gad7_1 has no help for everywhere else (ANY)");
    expect(broken((d) => void (d.safety = [rule({ message: "Get help — now." })]))).toEqual([
      expect.stringMatching(/^safety: the safety message on gad7_1: .*dash/),
    ]);
  });

  it("copy that diagnoses, but not the disclaimers", () => {
    for (const claim of [
      "You have anxiety.",
      "You have severe anxiety.",
      "You have moderate depression.",
      "You're anxious.",
      "You are clinically depressed.",
      "You have GAD.",
      "This means a diagnosis.",
    ]) {
      expect(
        broken((d) => void (d.bands[2]!.summary = claim)),
        claim
      ).toContain("copy: Moderate: the summary reads as a diagnosis");
    }
    for (const fine of [
      "This is a screen, not a diagnosis.",
      "Only a doctor can diagnose this.",
      "This isn't a diagnosis.",
    ]) {
      expect(
        broken((d) => void (d.bands[0]!.nextStep = fine)),
        fine
      ).toEqual([]);
    }
  });

  it("copy that breaks a Copy Gate rule: a dash, an absolute claim, or a hard read", () => {
    expect(
      broken((d) => void (d.bands[0]!.summary = "Your answers show few signs — for now."))
    ).toEqual([expect.stringMatching(/^copy: Minimal: the summary: .*dash/)]);
    // The Copy Gate calls an absolute claim a warning; in band copy it is a problem.
    expect(broken((d) => void (d.bands[0]!.nextStep = "You will always feel fine."))).toEqual([
      expect.stringMatching(/^copy: Minimal: the next step: .*absolute/),
    ]);
    expect(
      broken(
        (d) =>
          void (d.bands[0]!.nextStep =
            "Contemporaneous psychophysiological manifestations necessitate comprehensive interdisciplinary consultation.")
      )
    ).toEqual([expect.stringMatching(/^copy: Minimal: the next step reads at school grade/)]);
  });

  it("repeated item ids, a missing source, a credit line the license needs, and a form with no date", () => {
    expect(broken((d) => void (d.items[1]!.id = "gad7_1"))).toContain(
      "items: item ids repeat: gad7_1"
    );
    expect(broken((d) => void (d.citations = []))).toContain("license: no source is cited");
    expect(broken((d) => void (d.license = { ...d.license, attribution: undefined }))).toContain(
      "license: the license needs a credit line, and none is given"
    );
    expect(broken((d) => void (d.form = { ...d.form, retrieved: "last week" }))).toContain(
      "license: the published form needs a url and the day it was read (YYYY-MM-DD)"
    );
  });

  it("an unchecked license anywhere past draft", () => {
    expect(broken((d) => void (d.license = { ...d.license, kind: "unknown" }))).toContain(
      "license: the license is unchecked, so it must stay a draft (it is in-validation)"
    );
  });

  describe("sign-off", () => {
    // In the runbook's order: the fingerprint is the pack's, taken before anyone signs.
    const signed = (d: InstrumentDefinition) => {
      d.signedHash = reviewHash(d);
      d.signOff = standardSignOff(d).map((s) => ({ ...s, by: "Mark", on: "2026-10-01" }));
      d.status = "validated";
    };
    const statusOf = (change: (d: InstrumentDefinition) => void, base = def("gad7")) =>
      broken((d) => {
        signed(d);
        change(d);
      }, base).filter((p) => p.startsWith("status:"));

    it("passes with every standard line signed and dated against this source", () => {
      expect(statusOf(() => {})).toEqual([]);
    });

    it("refuses no lines, missing lines, an undated line, and a line with a made-up date", () => {
      expect(statusOf((d) => void (d.signOff = []))).toContain(
        "status: validated, but the sign-off lines are not the standard ones"
      );
      expect(statusOf((d) => void d.signOff.pop())).toContain(
        "status: validated, but the sign-off lines are not the standard ones"
      );
      expect(statusOf((d) => void (d.signOff[0]!.on = undefined))).toContain(
        "status: validated, but 1 sign-off line(s) are unsigned or undated"
      );
      expect(statusOf((d) => void (d.signOff[0]!.on = "not a date"))).toContain(
        "status: validated, but 1 sign-off line(s) are unsigned or undated"
      );
    });

    it("refuses anything signed that changed after, our copy and the safety routing included", () => {
      const changed = "status: validated, but it changed after it was signed: sign it again";
      const changes: Array<(d: InstrumentDefinition) => void> = [
        (d) => void (d.items[0]!.text = "Feeling nervous"),
        (d) => void (d.bands[0]!.summary = "Your answers show few signs."),
        (d) => void (d.bands[0]!.nextStep = "Carry on."),
        (d) => void (d.license = { ...d.license, attribution: "Someone else" }),
        (d) => void (d.citations = []),
      ];
      for (const change of changes) expect(statusOf(change)).toContain(changed);
      // PHQ-9's crisis message, and one digit of one help line.
      const phq9 = def("phq9");
      expect(statusOf((d) => void (d.safety![0]!.message = "Call someone."), phq9)).toContain(
        changed
      );
      const gb = (d: InstrumentDefinition) =>
        d.safety![0]!.resources.find((r) => r.region === "GB")!;
      expect(statusOf((d) => void (gb(d).lines[1] = "Samaritans: 116 124"), phq9)).toContain(
        changed
      );
      expect(statusOf(() => {}, phq9)).toEqual([]);
    });

    it("does not count the bookkeeping, or the order a file lists its fields in, as a change", () => {
      expect(statusOf((d) => void (d.version = "9.9.9"))).toEqual([]);
      expect(statusOf((d) => void (d.signOff[0]!.note = "Checked against the PDF."))).toEqual([]);
      const reversed = (v: unknown): unknown =>
        Array.isArray(v)
          ? v.map(reversed)
          : v !== null && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v)
                  .reverse()
                  .map(([k, x]) => [k, reversed(x)])
              )
            : v;
      const d = def("phq9");
      expect(reviewHash(reversed(d) as InstrumentDefinition)).toBe(reviewHash(d));
    });

    it("refuses a permission license with no record of the permission", () => {
      expect(statusOf((d) => void (d.license = { ...d.license, kind: "permission" }))).toContain(
        "status: validated with a permission license, but nobody recorded the permission"
      );
    });
  });
});

describe("scoring shapes the pilots do not use", () => {
  const custom = (over: Partial<InstrumentDefinition>): InstrumentDefinition => ({
    ...def("ucla3"),
    id: "test",
    items: [
      { id: "test_1", text: "One" },
      { id: "test_2", text: "Two", reverse: true },
    ],
    ...over,
  });

  it("flips a reversed item on its own scale, in the scorer and in the gate", () => {
    const d = custom({
      bands: [{ min: 2, max: 6, label: "All", summary: "Ok.", nextStep: "Ok." }],
    });
    const r = scoreInstrument(d, { test_1: 3, test_2: 3 });
    // 3 + (1 + 3 - 3) = 4
    expect(r.ok && r.total).toBe(4);
    expect(reachableTotals(d)).toEqual([2, 3, 4, 5, 6]);
  });

  it("averages when the manual averages, and bands the exact mean, not a rounded one", () => {
    const d = custom({
      scoring: { method: "mean" },
      items: [
        { id: "test_1", text: "One" },
        { id: "test_2", text: "Two" },
        { id: "test_3", text: "Three" },
      ],
      bands: [
        { min: 1, max: 5 / 3, label: "Low", summary: "Ok.", nextStep: "Ok." },
        { min: 2, max: 3, label: "High", summary: "Ok.", nextStep: "Ok." },
      ],
    });
    // Means are thirds: 1, 4/3, 5/3, 2, ... Rounded to two places, 5/3 reads 1.67, which is
    // above a band that ends at exactly 5/3: rounding first would find no band at all.
    expect(checkInstrument(d)).toEqual([]);
    const r = scoreInstrument(d, { test_1: 1, test_2: 2, test_3: 2 });
    expect(r.ok && [r.total, r.band.label]).toEqual([1.67, "Low"]);
  });
});
