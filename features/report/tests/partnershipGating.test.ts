import { describe, expect, it } from "vitest";
import {
  buildPartnership,
  PARTNERSHIP_FREE_BLOCKS,
  PARTNERSHIP_PRACTICE_FREE_BLOCKS,
  PARTNERSHIP_RAMP_THROUGH,
  REPORT_V4_PARTNERSHIP,
} from "@/data/report3-partnership";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * What a reader RECEIVES of the Challenges in Partnerships chapter (Figma 38:1672
 * open, 305:350 paywalled). The paywalled frame keeps paragraphs 1-4 sharp, ramps
 * the blur in over paragraph 5, and blurs the rest of the body, the loop, the
 * result and most of the practice at full length; a CSS blur is paint only, so
 * everything only ever seen under the full blur leaves the server scrambled
 * (Fatih's rule, 2026-09-23).
 */

const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

const SPARK = REPORT_V4_PARTNERSHIP["Spark Seeker"]!;
const payload = (locked: boolean) => JSON.stringify(buildPartnership("Spark Seeker", { locked }));

describe("the authored copy (38:1681 / 532:262 / 647:229 / 399:259)", () => {
  it("carries the frame's sixteen body blocks, the sixth the inline 'Common challenges' heading", () => {
    expect(SPARK.body).toHaveLength(16);
    expect(SPARK.body[5]).toEqual({ kind: "heading", text: "Common challenges" });
    expect(textOf(SPARK.body[0]!)).toBe(
      "Relationships do not become difficult simply because two people are different. Difficulties often emerge because two perfectly understandable patterns collide."
    );
    expect(textOf(SPARK.body[15]!)).toBe(
      "Once that interpretation appears, behavior may start changing. The Spark Seeker may initiate less, become more restless, notice attractive alternatives more strongly, or start criticizing the relationship for feeling flat. The partner senses the distance and may respond by trying harder to create security through planned intimacy, reassurance, or predictable routines."
    );
  });

  it("sets the frame's emphasis runs, and only those", () => {
    const runs = (i: number) => {
      const block = SPARK.body[i]!;
      if (block.kind !== "para") throw new Error(`block ${i} is not a paragraph`);
      return block.runs
        .filter((r) => r.weight || r.italic)
        .map((r) => [r.text, r.weight, r.italic]);
    };
    expect(runs(0)).toEqual([["two perfectly understandable patterns collide", 700, undefined]]);
    expect(runs(1)).toEqual([]);
    expect(runs(2)).toEqual([["Spark Seeker,", 700, undefined]]);
    expect(runs(3)).toEqual([
      [
        "What is each of us responding to, and what are we accidentally creating together?",
        700,
        true,
      ],
    ]);
    expect(runs(7)).toEqual([["Routine can feel different to each partner.", 700, undefined]]);
    expect(runs(8)).toEqual([
      ["Reassurance can collide with the need for freedom.", 700, undefined],
    ]);
    expect(runs(9)).toEqual([
      [
        "Different desire rhythms can be mistaken for different levels of attraction.",
        700,
        undefined,
      ],
    ]);
    // The key question is bold end to end.
    expect(
      runs(11)
        .map(([text]) => text)
        .join("")
    ).toBe(textOf(SPARK.body[11]!));
    expect(runs(14)).toEqual([
      ["Familiarity itself can begin to acquire meaning: “", 700, undefined],
      ["They do not really want me the way they used to.", 700, true],
      ["”", 700, undefined],
    ]);
  });

  it("keeps the frame's straight apostrophe and drops its trailing space", () => {
    expect(textOf(SPARK.body[9]!)).toContain("the Spark Seeker's push for more energy");
    expect(textOf(SPARK.body[10]!)).toBe(
      "The difficult part is that these moments rarely feel like a pattern from the inside. They feel like facts."
    );
  });

  it("has the six loop steps exactly as the cards draw them", () => {
    expect(SPARK.loop.map((s) => [s.happens, s.underneath])).toEqual([
      [
        "More familiarity, more predictability, less teasing and pursuit",
        "The relationship stabilizes and uncertainty drops",
      ],
      ["“We have lost the spark”", "Intensity is my evidence that love is real"],
      [
        "I withdraw, initiate less, become restless, or seek more aliveness",
        "Protecting myself from confirming the fear",
      ],
      ["“Something is wrong, I am losing them”", "Their own fear of losing me"],
      [
        "They reach for more reassurance, closeness, and predictability",
        "Seeking safety through proximity",
      ],
      ["I feel more confined and less energized", "The loop has produced its own evidence"],
    ]);
  });

  it("bolds the result paragraph from its second sentence (647:229)", () => {
    expect(SPARK.result).toEqual({
      kind: "para",
      runs: [
        { text: "The result is a loop. " },
        {
          text: "The more the partner tries to make the relationship feel secure, the more predictable it becomes. The more predictable it becomes, the more the Spark Seeker may experience the loss of excitement as evidence that something is wrong.",
          weight: 700,
        },
      ],
    });
  });

  it("sets the practice with ONE ordered three-item list, as 399:259 draws it", () => {
    expect(SPARK.practiceEyebrow).toBe("Practice time: ~10 min.");
    expect(SPARK.practiceTitle).toBe("Try this & see what shifts");
    expect(SPARK.practice).toHaveLength(12);
    const lists = SPARK.practice.filter((b) => b.kind === "list");
    expect(lists).toHaveLength(1);
    const list = SPARK.practice[3]!;
    expect(list.kind === "list" && list.ordered).toBe(true);
    expect(
      list.kind === "list" && list.items.map((runs) => runs.map((r) => r.text).join(""))
    ).toEqual([
      "What actually happened? Describe the situation without explaining it.",
      "What did I make it mean? Notice the conclusion that appeared automatically.",
      "What am I actually missing or needing? Look underneath words such as boring, trapped, or disconnected.",
    ]);
    expect(textOf(SPARK.practice[2]!)).toBe("When tension appears, ask three questions:");
  });

  it("drops the sentence the frame and Sanjin's doc both cut off (Fatih, 24.09)", () => {
    const principle = textOf(SPARK.practice[8]!);
    expect(principle.endsWith("Build security without removing all uncertainty.")).toBe(true);
    expect(payload(false)).not.toContain("leave room inside");
  });

  it("gives the closed card practice paragraphs 1-2 as its teaser (399:219)", () => {
    expect(SPARK.practiceTeaser).toEqual(SPARK.practice.slice(0, 2));
  });
});

describe("buildPartnership — unlocked", () => {
  const view = buildPartnership("Spark Seeker")!;

  it("hands over every word, nothing split off", () => {
    expect(view.locked).toBe(false);
    expect(view.body).toEqual({ free: SPARK.body, ramp: null, rest: [] });
    expect(view.loop).toEqual(SPARK.loop);
    expect(view.result).toEqual(SPARK.result);
    expect(view.practice).toMatchObject({
      free: SPARK.practice,
      ramp: null,
      rest: [],
      locked: false,
      teaser: SPARK.practiceTeaser,
      eyebrow: SPARK.practiceEyebrow,
      title: SPARK.practiceTitle,
    });
  });

  it("keeps the practice list whole, so a paying reader sees one list of three", () => {
    const lists = view.practice.free.filter((b) => b.kind === "list");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.kind === "list" && lists[0]!.items).toHaveLength(3);
  });

  it("is null for an archetype nobody has written yet, so the V2 section stays", () => {
    expect(buildPartnership("Explorer of Edges")).toBeNull();
    expect(buildPartnership("Explorer of Edges", { locked: true })).toBeNull();
  });
});

describe("buildPartnership — locked", () => {
  const view = buildPartnership("Spark Seeker", { locked: true })!;

  it("keeps paragraphs 1-4 sharp, as 305:359 does", () => {
    expect(view.locked).toBe(true);
    expect(PARTNERSHIP_FREE_BLOCKS).toBe(4);
    expect(view.body.free).toEqual(SPARK.body.slice(0, 4));
  });

  it("ramps into paragraph 5, real only through the fade band", () => {
    const ramp = textOf(view.body.ramp!);
    const authored = textOf(SPARK.body[4]!);
    const cut = authored.indexOf(PARTNERSHIP_RAMP_THROUGH);
    expect(cut).toBeGreaterThan(0);
    const end = cut + PARTNERSHIP_RAMP_THROUGH.length;
    expect(ramp.slice(0, end)).toBe(authored.slice(0, end));
    expect(ramp.slice(end)).not.toBe(authored.slice(end));
    expect(ramp).toHaveLength(authored.length);
  });

  it("scrambles everything past the ramp, same shape", () => {
    expect(view.body.rest).toHaveLength(SPARK.body.length - 5);
    view.body.rest.forEach((block, i) => {
      const original = SPARK.body[i + 5]!;
      expect(block.kind).toBe(original.kind);
      expect(textOf(block)).toHaveLength(textOf(original).length);
      expect(textOf(block)).not.toBe(textOf(original));
    });
  });

  it("scrambles the loop and the result, which a locked reader only sees fully blurred", () => {
    view.loop.forEach((stage, i) => {
      const original = SPARK.loop[i]!;
      expect(stage.happens).toHaveLength(original.happens.length);
      expect(stage.happens).not.toBe(original.happens);
      expect(stage.underneath).toHaveLength(original.underneath.length);
      expect(stage.underneath).not.toBe(original.underneath);
    });
    expect(textOf(view.result)).toHaveLength(textOf(SPARK.result).length);
    expect(textOf(view.result)).not.toBe(textOf(SPARK.result));
  });

  it("splits the practice list only here: items 1-2 ramp in, item 3 onward is blurred", () => {
    expect(PARTNERSHIP_PRACTICE_FREE_BLOCKS).toBe(3);
    expect(view.practice.locked).toBe(true);
    expect(view.practice.free).toEqual(SPARK.practice.slice(0, 3));
    const list = SPARK.practice[3]!;
    if (list.kind !== "list") throw new Error("practice[3] is not the list");
    expect(view.practice.ramp).toEqual({
      kind: "list",
      ordered: true,
      items: list.items.slice(0, 2),
    });
    const [third, ...after] = view.practice.rest;
    expect(third).toMatchObject({ kind: "list", ordered: true, start: 3 });
    expect(third!.kind === "list" && third!.items).toHaveLength(1);
    expect(textOf(third!)).toHaveLength(
      textOf({ kind: "list", items: list.items.slice(2) }).length
    );
    expect(textOf(third!)).not.toBe(textOf({ kind: "list", items: list.items.slice(2) }));
    expect(after).toHaveLength(SPARK.practice.length - 4);
  });

  it("shows a locked reader the same closed teaser as everyone — it is free copy", () => {
    expect(view.practice.teaser).toEqual(SPARK.practiceTeaser);
  });

  it("puts no paid copy past the wall anywhere in the payload", () => {
    const locked = payload(true);
    const unlocked = payload(false);
    const probes = [
      // Paragraph 5 past its fade band.
      "staying present through slower forms of intimacy",
      // The body past the ramp.
      "Some relationship tensions are especially likely",
      "Routine can feel different to each partner.",
      "Reassurance can collide with the need for freedom.",
      "Different desire rhythms can be mistaken",
      "They feel like facts.",
      "The key question is whether",
      "Imagine a couple whose sexual life",
      "One partner experiences this as comfort.",
      "They do not really want me the way they used to.",
      "Once that interpretation appears",
      // The loop.
      "More familiarity, more predictability",
      "We have lost the spark",
      "Intensity is my evidence that love is real",
      "I withdraw, initiate less",
      "Protecting myself from confirming the fear",
      "Something is wrong, I am losing them",
      "Their own fear of losing me",
      "They reach for more reassurance",
      "Seeking safety through proximity",
      "I feel more confined and less energized",
      "The loop has produced its own evidence",
      // The result.
      "The more the partner tries to make the relationship feel secure",
      // The practice past its ramp.
      "What am I actually missing or needing?",
      "might mean missing teasing",
      "Once the need becomes specific",
      "Our sex life has become boring",
      "You are suffocating me",
      "keep the commitment clear while leaving parts of the experience open",
      "unusually energizing long-term partner",
      "Your challenge is not to stop wanting spark",
      "from waiting for aliveness to happen",
    ];
    for (const probe of probes) {
      expect(unlocked, probe).toContain(probe);
      expect(locked, probe).not.toContain(probe);
    }
  });
});
