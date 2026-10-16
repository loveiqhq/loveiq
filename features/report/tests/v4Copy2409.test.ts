import { describe, expect, it } from "vitest";
import { REPORT_V4_TOP_THREE_HEADING } from "@/data/report3-archetype-page";
import { REPORT_V4_SUMMARY } from "@/data/report3-summary";
import { REPORT_V4_TYPICAL_BELIEFS } from "@/data/report3-typical-beliefs";

/**
 * Copy Mark updated in the Report-3.0 file on 2026-09-24 and asked to see on
 * staging, read verbatim off the nodes named below.
 */

describe("top-three heading (1:494, comment 1939883544)", () => {
  it("capitalises Highest and Scoring", () => {
    expect(REPORT_V4_TOP_THREE_HEADING).toBe("3 Highest Scoring Archetypes");
  });

  // Its lede (1:496) went with the slimmed report, 16.10: v4Slim1610.test.tsx.
});

describe("Part II summary (1:741, comment 1939884155)", () => {
  const summary = REPORT_V4_SUMMARY["Spark Seeker"]!;
  const text = (i: number) => summary.paragraphs[i]!.map((r) => r.text).join("");
  const bold = (i: number) =>
    summary.paragraphs[i]!.filter((r) => r.weight).map((r) => [r.weight, r.text.trim()]);

  // Past its third paragraph's first sentence the Summary sits behind the slimmed report's
  // wall (16.10), so the paragraphs after the free ones are checked by shape, not words.
  it("reads word for word as the frame, where it is free", () => {
    expect(text(0)).toMatch(/^The Spark Seeker experiences sexuality primarily as a space/);
    expect(text(1)).toMatch(/^They are lively, charismatic, and pleasure-forward lovers/);
  });

  it("bolds the runs the frame bolds, and only those", () => {
    expect(bold(1)).toEqual([
      [700, "lively, charismatic, and pleasure-forward lovers"],
      [700, "teasing, spontaneity, and emotional lightness"],
    ]);
    expect(bold(2).map(([weight]) => weight)).toEqual([700, 700]);
    expect(bold(3).map(([weight]) => weight)).toEqual([800]);
    expect(bold(4).map(([weight]) => weight)).toEqual([800]);
  });

  it("drops the closing line the frame no longer draws (1:744)", () => {
    expect(summary.closer).toBeUndefined();
  });
});

describe("Typical Beliefs panels (368:5482 / 368:5623, comment 1940014480)", () => {
  const panels = REPORT_V4_TYPICAL_BELIEFS["Spark Seeker"]!;

  it("pairs each shadow belief with the chapter's own shift", () => {
    expect(panels.turns.map((t) => [t.shadow, t.shift])).toEqual([
      [
        "“If sex has to be planned, the spark must be gone.”",
        "“Planning can create the conditions for anticipation and spark.”",
      ],
      [
        "“Real desire should happen spontaneously.”",
        "“Spontaneous desire excites me, but desire can also emerge once intimacy begins.”",
      ],
      [
        "“If things feel predictable, attraction must be fading.”",
        "“Familiarity can lower excitement sometimes without saying anything definitive about attraction.”",
      ],
      [
        "“Good sex should keep becoming more exciting.”",
        "“Great sex does not always need to escalate. Sometimes depth, connection, or anticipation can be just as powerful.”",
      ],
      [
        "“I need novelty to stay sexually interested.”",
        "“Novelty strongly activates my desire, but I can create freshness without constantly needing something completely new.”",
      ],
      [
        "“If my partner rarely initiates, they must not really want me.”",
        "“Initiation is one expression of desire, not the only evidence that desire exists.”",
      ],
      [
        "“Being desired proves that I am still attractive and exciting.”",
        "“Being desired feels good, but it does not determine my worth or attractiveness.”",
      ],
      [
        "“Talking about how to make sex better makes it less natural.”",
        "“Talking openly can give us more material to play with, not less.”",
      ],
      [
        "“If I have to ask for flirting or pursuit, it no longer counts.”",
        "“Asking for what turns me on does not make the response less genuine.”",
      ],
      [
        "“Once a relationship becomes too safe or routine, passion inevitably disappears.”",
        "“Safety and excitement can coexist, especially when we keep creating room for curiosity and play.”",
      ],
    ]);
  });

  it("lists the ten sun beliefs in the frame's order", () => {
    expect(panels.sun).toEqual([
      "“Curiosity is one of the ways I keep my sexuality alive.”",
      "“I enjoy discovering new sides of myself, my partner, and what turns us on.”",
      "“I can bring playfulness and energy into intimacy instead of waiting for excitement to appear on its own.”",
      "“Anticipation can be erotic in itself. Flirting, teasing, and build-up can make desire stronger.”",
      "“I am allowed to want variety, experimentation, and change without assuming something is missing.”",
      "“I can be open about what excites me and invite my partner into that exploration.”",
      "“Familiarity can give me enough safety to experiment more boldly.”",
      "“I notice chemistry quickly, and I can use that sensitivity to understand what makes desire come alive for me.”",
      "“I can create novelty through small changes in mood, setting, energy, or interaction, not only through completely new experiences.”",
      "“Sex can stay alive when I treat excitement as something I can participate in creating.”",
    ]);
  });
});
