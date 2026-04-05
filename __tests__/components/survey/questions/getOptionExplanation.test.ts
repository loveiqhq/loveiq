import { describe, expect, it } from "vitest";
import { getOptionExplanation } from "@/components/survey/questions/getOptionExplanation";

describe("getOptionExplanation", () => {
  const question = {
    answerOptionsExplained: [
      { option: "Very Often", explanation: "This happens frequently." },
      { option: "Not sure", explanation: "Use this when you feel genuinely uncertain." },
    ],
  } as Parameters<typeof getOptionExplanation>[0];

  it("matches option explanations case-insensitively and normalizes whitespace", () => {
    expect(getOptionExplanation(question, "  very    often ")).toBe("This happens frequently.");
  });

  it("returns undefined when no matching explanation exists", () => {
    expect(getOptionExplanation(question, "Never")).toBeUndefined();
  });
});
