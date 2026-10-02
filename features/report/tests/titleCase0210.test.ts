import { describe, expect, it } from "vitest";
import { titleCase } from "@features/report/logic/titleCase";

// Review 02.10, the sync: the team adopted ChatGPT's capitalisation rule for the report's
// titles and headings (Marcus: "So can we stick to the chat? Is it agreed?"; Mark: "And so I
// don't need to do it."; Fatih: "Yeah, you don't."). Mark pasted it into Figma (08:27):
// capitalise the first and the last word and every major word, adverbs included; keep the
// articles (a, an, the), the coordinating conjunctions and the short prepositions (in, on,
// at, to, by, of, for, with) in lower case.
describe("titleCase — the report's heading rule (02.10)", () => {
  it.each([
    ["What shaped this report", "What Shaped This Report"],
    ["Common challenges", "Common Challenges"],
    ["Try this & see what shifts", "Try This & See What Shifts"],
    ["Learn more & go deeper", "Learn More & Go Deeper"],
    ["What a fantasy might actually be about", "What a Fantasy Might Actually Be About"],
    ["Fantasy is not the same as wanting", "Fantasy Is Not the Same as Wanting"],
    ["Where these ideas come from", "Where These Ideas Come From"],
    ["Where the model comes from", "Where the Model Comes From"],
    [
      "Why imagination and reality can feel so different",
      "Why Imagination and Reality Can Feel So Different",
    ],
    [
      "Turning an automatic belief into a conscious choice",
      "Turning an Automatic Belief Into a Conscious Choice",
    ],
    ["The hidden variable: context", "The Hidden Variable: Context"],
    ["From fantasy to self-knowledge", "From Fantasy to Self-Knowledge"],
    ["14-day money-back", "14-Day Money-Back"],
    ["Unlock full insights!", "Unlock Full Insights!"],
    ["You're a constellation, not a type", "You're a Constellation, Not a Type"],
    ["How your archetype works", "How Your Archetype Works"],
    ["Avoidant / secure", "Avoidant / Secure"],
    ["who makes the first move", "Who Makes the First Move"],
  ])("%s → %s", (input, output) => {
    expect(titleCase(input)).toBe(output);
  });

  it("keeps the names and marks it is given: LoveIQ, Spark Seeker, vs., numbers", () => {
    expect(titleCase("The Spark Seeker belief map")).toBe("The Spark Seeker Belief Map");
    expect(titleCase("Fantasy vs. Reality")).toBe("Fantasy vs. Reality");
    expect(titleCase("3 Highest Scoring Archetypes")).toBe("3 Highest Scoring Archetypes");
    expect(titleCase("why LoveIQ works")).toBe("Why LoveIQ Works");
  });

  it("lower-cases a small word in the middle, and capitalises it first or last", () => {
    expect(titleCase("Science of desire and attraction")).toBe("Science of Desire and Attraction");
    expect(titleCase("the best way to understand your sexuality")).toBe(
      "The Best Way to Understand Your Sexuality"
    );
    expect(titleCase("what it comes down to")).toBe("What It Comes Down To");
  });
});
