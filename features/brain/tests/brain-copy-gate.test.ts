import { describe, expect, it } from "vitest";
import {
  checkCopy,
  readingGrade,
  renderCopyReport,
  sentencesOf,
  shippedCopy,
  type CopyFinding,
} from "@features/brain/server/copy-gate";

/**
 * A small stand-in for the shipped copy, so every rule is tested against text chosen to
 * trip it, not against whatever the real chapters happen to contain this week.
 */
const CONTENT: Record<string, Record<string, string>> = {
  motivation: {
    "Spark Seeker":
      "<p>The Spark Seeker wants novelty. The Spark Seeker is here for a good time with no regrets at all.</p>",
    "Quiet Withdrawer":
      "<p>The Quiet Withdrawer wants calm. The Quiet Withdrawer is here for a good time with no regrets at all.</p>",
    "Tender Devotee":
      "<p>The Tender Devotee wants closeness. The Tender Devotee is here for a good time with no regrets at all.</p>",
    "Loyal Ritualist":
      "<p>The Loyal Ritualist wants rhythm. The Loyal Ritualist is here for a good time with no regrets at all.</p>",
  },
  energy: {
    "Spark Seeker":
      "<p>Energy for this archetype comes in bright short bursts that fade fast afterwards.</p>",
    "Quiet Withdrawer": "<p>Energy is quiet.</p>",
    "Tender Devotee": "<p>Energy is warm.</p>",
    "Loyal Ritualist": "<p>Energy is steady.</p>",
  },
};

const kinds = (fs: CopyFinding[]) => fs.map((f) => f.kind);
const find = (fs: CopyFinding[], kind: string) => fs.find((f) => f.kind === kind);

describe("checkCopy — the rules asked for in words", () => {
  it("fails a dash as an error, with the sentence, and leaves a hyphen alone", () => {
    const r = checkCopy(
      { text: "They move fast — then stop. A well-known pattern. Another one – here." },
      CONTENT
    );
    const f = find(r.findings, "em-dash")!;
    expect(f.severity).toBe("error");
    expect(f.evidence).toEqual(["They move fast — then stop.", "Another one – here."]);
  });

  it("reports machine-written phrases as one finding with a count for each", () => {
    const r = checkCopy(
      {
        text: "In essence they want more. They truly care. Truly, deeply, they do. They are on a journey.",
      },
      CONTENT
    );
    const phrases = r.findings.filter((f) => f.kind === "ai-phrase");
    expect(phrases).toHaveLength(1);
    expect(phrases[0]!.message).toContain('"in essence" ×1');
    expect(phrases[0]!.message).toContain('"truly" ×2');
    expect(phrases[0]!.message).toContain('"deeply" ×1');
    expect(phrases[0]!.message).toContain('"journey" ×1');
    // A word that merely contains a tell is not one.
    expect(checkCopy({ text: "The journeyman arrived." }, CONTENT).findings).toEqual([]);
  });

  it("flags an absolute claim, but not one inside a quotation", () => {
    const r = checkCopy(
      { text: 'They always need space. Partners often say "you never listen" to them.' },
      CONTENT
    );
    expect(find(r.findings, "absolute")!.evidence).toEqual(["They always need space."]);
  });

  it("warns above grade 8 with the hardest sentences first, and not on plain text", () => {
    const hard =
      "The multidimensional conceptualization of interpersonal attachment necessitates comprehensive psychometric operationalization. " +
      "Physiological arousal fluctuates unpredictably throughout extended relational configurations. " +
      "They like to talk.";
    const r = checkCopy({ text: hard }, CONTENT);
    const f = find(r.findings, "reading-level")!;
    expect(f.severity).toBe("warn");
    expect(f.evidence?.[0]).toMatch(/^The multidimensional/);
    expect(
      find(
        checkCopy({ text: "They like to talk. They like to play. They like new things." }, CONTENT)
          .findings,
        "reading-level"
      )
    ).toBeUndefined();
  });

  it("warns when a draft is far longer than the shipped chapter", () => {
    const long = Array.from({ length: 40 }, () => "They like to talk with people.").join(" ");
    const r = checkCopy({ text: long, chapter: "motivation", archetype: "Spark Seeker" }, CONTENT);
    expect(find(r.findings, "length")!.message).toMatch(
      /against a median of \d+ in the shipped "motivation"/
    );
  });

  /**
   * The line that fits every archetype: the same sentence, only the name swapped, in three
   * or more OTHER archetypes' versions of the chapter.
   */
  it("finds a fill-in-the-name sentence shared with three other archetypes", () => {
    const r = checkCopy(
      {
        text: "The Spark Seeker is here for a good time with no regrets at all.",
        chapter: "motivation",
        archetype: "Spark Seeker",
      },
      CONTENT
    );
    expect(find(r.findings, "fits-every-archetype")!.evidence).toEqual([
      "The Spark Seeker is here for a good time with no regrets at all.",
    ]);
  });

  it("does not count the draft's own archetype towards the three", () => {
    const content = {
      motivation: {
        "Spark Seeker": CONTENT.motivation!["Spark Seeker"]!,
        "Quiet Withdrawer": CONTENT.motivation!["Quiet Withdrawer"]!,
        "Tender Devotee": CONTENT.motivation!["Tender Devotee"]!,
      },
    };
    // Only two OTHER archetypes share it here.
    const r = checkCopy(
      {
        text: "The Spark Seeker is here for a good time with no regrets at all.",
        chapter: "motivation",
        archetype: "Spark Seeker",
      },
      content
    );
    expect(kinds(r.findings)).not.toContain("fits-every-archetype");
  });

  it("finds a sentence lifted from another chapter, and names the chapter", () => {
    const r = checkCopy(
      {
        text: "Energy for this archetype comes in bright short bursts that fade fast afterwards.",
        chapter: "motivation",
        archetype: "Spark Seeker",
      },
      CONTENT
    );
    expect(find(r.findings, "repeats-chapter")!.evidence?.[0]).toContain('(also in "energy")');
  });

  it("includes the chapter's own voice check, and skips chapter checks for an unknown chapter", () => {
    // Longer than three words: the voice check deliberately ignores shorter fragments.
    const draft = "You want something new every single week.";
    const r = checkCopy({ text: draft, chapter: "motivation" }, CONTENT);
    expect(find(r.findings, "register")?.severity).toBe("error");
    const unknown = checkCopy({ text: draft, chapter: "no-such-chapter" }, CONTENT);
    expect(kinds(unknown.findings)).not.toContain("register");
    expect(unknown.shippedGrade).toBeNull();
  });
});

describe("renderCopyReport", () => {
  it("lists what must be fixed before what is worth fixing", () => {
    const out = renderCopyReport(
      checkCopy({ text: "They always rush — always." }, CONTENT),
      "draft"
    );
    expect(out.indexOf("MUST FIX")).toBeGreaterThan(-1);
    expect(out.indexOf("MUST FIX")).toBeLessThan(out.indexOf("WORTH FIXING"));
  });

  it("says so plainly when nothing is flagged, without claiming the meaning was checked", () => {
    const out = renderCopyReport(checkCopy({ text: "They like to talk." }, CONTENT), "draft");
    expect(out).toContain("Nothing flagged");
    expect(out).toContain("Meaning and evidence still need reading");
  });
});

describe("the real shipped copy", () => {
  it("can be audited: a shipped chapter exists for every archetype it names", () => {
    const text = shippedCopy("motivation", "Spark Seeker");
    expect(text).toBeTruthy();
    const r = checkCopy({ text: text!, chapter: "motivation", archetype: "Spark Seeker" });
    expect(r.words).toBeGreaterThan(50);
    expect(r.shippedGrade).toBeGreaterThan(0);
  });

  it("splits sentences and grades plain text low and dense text high", () => {
    expect(sentencesOf("One. Two! Three?\nFour")).toEqual(["One.", "Two!", "Three?", "Four"]);
    expect(readingGrade("The cat sat on the mat. It was happy.")).toBeLessThan(3);
    expect(
      readingGrade(
        "The multidimensional conceptualization of interpersonal attachment necessitates operationalization."
      )
    ).toBeGreaterThan(15);
  });
});
