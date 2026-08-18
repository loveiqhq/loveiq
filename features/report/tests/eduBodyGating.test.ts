import { describe, expect, it } from "vitest";

import { stripLockedEduBody } from "@features/report/server/contentGating";

/**
 * The "Learn:" disclosure shipped whole to every reader: `edu.body.*` and
 * `edu.struct.*` sat in the /api/report payload regardless of `locked`, so the
 * peek→expand control handed the full explanation to readers who had bought
 * nothing. The teaser is the tease and stays; the body is the paid asset and
 * must never reach the wire.
 */
describe("stripLockedEduBody", () => {
  const lockedSection = {
    "gate.hook": "Where your desire actually starts",
    "edu.eyebrow": "Learn: arousal, desire, and pleasure",
    "edu.teaser": "Desire has two engines, and most people only know one.",
    "edu.body.p1": "The first engine is spontaneous — it arrives unbidden.",
    "edu.body.p2": "The second is responsive — it needs a runway.",
    "learn.body": "What you will learn in this section",
    locked: true,
  };

  it("leaves an unlocked section completely untouched", () => {
    const unlocked = { ...lockedSection, locked: false };

    expect(stripLockedEduBody(unlocked)).toEqual(unlocked);
  });

  it("nulls every edu body paragraph after the first on a locked section", () => {
    const result = stripLockedEduBody(lockedSection);

    expect(result["edu.body.p2"]).toBeNull();
  });

  it("ships a short prefix of the FIRST paragraph so the peek fills three lines", () => {
    // Figma's collapsed peek runs teaser THEN body, cut mid-sentence. With p1
    // nulled outright the third line came out blank on most chapters.
    const result = stripLockedEduBody(lockedSection);

    expect(result["edu.body.p1"]).toBe("The first engine is spontaneous — it arrives unbidden.");
  });

  it("cuts a long first paragraph on a word boundary, under the tease budget", () => {
    const long = "word ".repeat(80).trim();
    const result = stripLockedEduBody({ ...lockedSection, "edu.body.p1": long });
    const p1 = result["edu.body.p1"] as string;

    expect(p1.length).toBeLessThanOrEqual(140);
    // A word boundary, and no ellipsis — the fade is what says "there is more".
    expect(long.startsWith(p1)).toBe(true);
    expect(p1.endsWith("word")).toBe(true);
    expect(p1).not.toContain("…");
    // The paid remainder never reaches the wire.
    expect(p1.length).toBeLessThan(long.length);
  });

  it("keeps the eyebrow and teaser so the block still sells the section", () => {
    const result = stripLockedEduBody(lockedSection);

    expect(result["edu.teaser"]).toBe("Desire has two engines, and most people only know one.");
    expect(result["edu.eyebrow"]).toBe("Learn: arousal, desire, and pleasure");
  });

  it("does not disturb unrelated keys", () => {
    const result = stripLockedEduBody(lockedSection);

    expect(result["gate.hook"]).toBe("Where your desire actually starts");
    expect(result["learn.body"]).toBe("What you will learn in this section");
    expect(result.locked).toBe(true);
  });

  it("nulls the enumerated struct list too (curiosity ships 14 of them)", () => {
    const curiosity = {
      "edu.teaser": "Fourteen structures, one of which is probably yours.",
      "edu.struct.1": "Monogamy: one partner, closed.",
      "edu.struct.14": "Solo polyamory: many partners, no hierarchy.",
      locked: true,
    };

    const result = stripLockedEduBody(curiosity);

    expect(result["edu.struct.1"]).toBeNull();
    expect(result["edu.struct.14"]).toBeNull();
    expect(result["edu.teaser"]).toBe("Fourteen structures, one of which is probably yours.");
  });
});
