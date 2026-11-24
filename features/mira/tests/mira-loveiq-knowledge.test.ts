import { describe, expect, it } from "vitest";
import { archetypeContent } from "@/data/report-archetypes";
import { MIRA_SYSTEM_PROMPT } from "@features/mira/content/system-prompt";

/**
 * 23 Nov 2026: Marcus asked Mira about LoveIQ in the morning sync and she said she didn't know.
 * Probed on staging the next day, "Tell me about the sexual archetypes" got "a bit outside what I
 * know most about", and "What is LoveIQ?" got "I don't know much more about the company". She now
 * knows LoveIQ's own product, in the report's words, and helps first on neighbouring topics.
 */
const firstSentence = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .trim()
    .split(/(?<=\.)\s/)[0]!;

describe("Mira knows LoveIQ", () => {
  it("names every archetype in its report's own first sentence", () => {
    const core = archetypeContent.core_archetype!;
    const names = Object.keys(core);
    expect(names).toHaveLength(14);
    for (const name of names) {
      const gist = firstSentence(core[name]!).replace(`The ${name} `, "");
      expect(MIRA_SYSTEM_PROMPT).toContain(`- ${name}: ${gist}`);
    }
  });

  it("says what LoveIQ is and how to find one's archetype", () => {
    expect(MIRA_SYSTEM_PROMPT).toMatch(/## About LoveIQ/);
    expect(MIRA_SYSTEM_PROMPT).toMatch(/14 sexual archetypes/);
    expect(MIRA_SYSTEM_PROMPT).toMatch(/never a diagnosis/);
  });

  it("helps first on neighbouring topics, and never opens with what she doesn't know", () => {
    expect(MIRA_SYSTEM_PROMPT).toMatch(/2\. Neighbouring topics[^\n]*Help first/);
    expect(MIRA_SYSTEM_PROMPT).not.toContain(
      `Say where your knowledge ends ("That's a bit outside what I know most about")`
    );
  });

  it("helps with desire and with asking a partner before naming the coach who is coming", () => {
    const desire = MIRA_SYSTEM_PROMPT.slice(MIRA_SYSTEM_PROMPT.indexOf("- Low desire or libido"));
    expect(desire.slice(0, desire.indexOf("Jonas"))).toMatch(/one idea to try/);
    const partner = MIRA_SYSTEM_PROMPT.slice(MIRA_SYSTEM_PROMPT.indexOf("- Asking a partner"));
    expect(partner.slice(0, partner.indexOf("Ana"))).toMatch(/ways to start that talk/);
  });
});
