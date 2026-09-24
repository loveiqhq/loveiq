import { describe, expect, it, vi } from "vitest";
import {
  buildContextPack,
  matchingPrompts,
  PACK_BUDGET,
  type PackDeps,
} from "@features/brain/server/context-pack";

const CONTENT: Record<string, Record<string, string>> = {
  core_archetype: {
    "Spark Seeker": "<p>The Spark Seeker lives for novelty and play.</p>",
    "Quiet Withdrawer": "<p>The Quiet Withdrawer values calm and distance.</p>",
  },
  motivation: {
    "Spark Seeker": "<p>The Spark Seeker is moved by excitement. They seek new things often.</p>",
    "Quiet Withdrawer": "<p>The Quiet Withdrawer is moved by safety. They seek calm often.</p>",
  },
};

const DOCS = [
  { source_id: "drive/doc:bp", title: "BLUEPRINT_Chapter_Prompts" },
  { source_id: "drive/doc:mot", title: "Motivation_Chapter_Prompt" },
  { source_id: "drive/doc:bel", title: "Typical_Beliefs_Chapter_Prompt" },
];

const deps = (over: Partial<PackDeps> = {}): PackDeps => ({
  promptDocs: vi.fn(async () => DOCS),
  findEvidence: vi.fn(async () => [
    { id: "evidence/paper:1", title: "Novelty seeking and desire", body: "A study of novelty." },
  ]),
  ...over,
});

describe("buildContextPack", () => {
  it("hands over the chapter's own rules, the text, a model, who the archetype is, research and prompts", async () => {
    const d = deps();
    const pack = await buildContextPack(
      { chapter: "motivation", archetype: "Spark Seeker" },
      d,
      CONTENT
    );
    expect(pack).toMatch(/^# Context pack: motivation for the Spark Seeker/);
    // Third person in every shipped version, so the rule says so for this chapter.
    expect(pack).toContain('never "you"');
    expect(pack).toContain("The Spark Seeker is moved by excitement");
    // A DIFFERENT archetype's version as the model, not the same one twice.
    expect(pack).toContain("The same chapter for the Quiet Withdrawer, as a model");
    expect(pack).toContain("The Spark Seeker lives for novelty and play");
    expect(pack).toContain('Novelty seeking and desire: fetch_document("evidence/paper:1")');
    expect(pack).toContain('fetch_document("drive/doc:mot")');
    expect(pack).toContain('fetch_document("drive/doc:bp")');
    expect(pack).not.toContain("drive/doc:bel");
    expect(d.findEvidence).toHaveBeenCalledWith("motivation Spark Seeker");
  });

  it("stays inside its budget with every section at its maximum, and says what it trimmed", async () => {
    const huge = `<p>${"Word ".repeat(5000)}</p>`;
    const long = {
      core_archetype: { "Spark Seeker": huge, "Quiet Withdrawer": huge },
      motivation: { "Spark Seeker": huge, "Quiet Withdrawer": huge },
    };
    const many = Array.from({ length: 40 }, (_, i) => ({
      source_id: `drive/doc:${"x".repeat(40)}${i}`,
      title: `Motivation_Chapter_Prompt_${"long title ".repeat(8)}${i}`,
    }));
    const pack = await buildContextPack(
      { chapter: "motivation", archetype: "Spark Seeker" },
      deps({
        promptDocs: async () => many,
        findEvidence: async () =>
          Array.from({ length: 10 }, (_, i) => ({
            id: `evidence/${"y".repeat(80)}${i}`,
            title: "A very long research card title ".repeat(10),
            body: "",
          })),
      }),
      long
    );
    expect(pack.length).toBeLessThanOrEqual(PACK_BUDGET);
    expect(pack).toMatch(/Trimmed to stay short: this chapter as shipped for the spark seeker/);
  });

  it("still builds when the research or the prompt listing is unreachable, and says so", async () => {
    const pack = await buildContextPack(
      { chapter: "motivation", archetype: "Spark Seeker" },
      deps({
        findEvidence: async () => {
          throw new Error("down");
        },
        promptDocs: async () => {
          throw new Error("down");
        },
      }),
      CONTENT
    );
    expect(pack).toContain("No research card matched this chapter");
    expect(pack).toContain("None matched by title");
  });

  it("does not repeat who the archetype is when the chapter IS the core description", async () => {
    const pack = await buildContextPack(
      { chapter: "core_archetype", archetype: "Spark Seeker" },
      deps(),
      CONTENT
    );
    expect(pack).not.toContain("Who the Spark Seeker is");
  });
});

describe("matchingPrompts", () => {
  it("matches on the chapter's words and always keeps the blueprint", () => {
    const docs = [
      ...DOCS,
      { source_id: "drive/doc:ch", title: "Challenges_in_Partnership_Prompt_Chapter" },
    ];
    expect(matchingPrompts("challenges_enjoy", docs).map((d) => d.source_id)).toEqual([
      "drive/doc:bp",
      "drive/doc:ch",
    ]);
    expect(matchingPrompts("beliefs", docs).map((d) => d.source_id)).toEqual([
      "drive/doc:bp",
      "drive/doc:bel",
    ]);
    // A short chapter word is not a match: "ons" in turn_ons is inside "Instructions".
    const withInstructions = [{ source_id: "drive/doc:ins", title: "Prompt: Instructions" }];
    expect(matchingPrompts("turn_ons", withInstructions)).toEqual([]);
  });
});
