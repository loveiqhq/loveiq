import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  MAX_PER_MEETING,
  MINER_VERSION,
  TOPICS,
  buildMinedRows,
  parseMined,
} from "@features/brain/server/ingest/mine-decisions";

/**
 * The notes a decision has to be quoted OUT OF. Everything below checks the extraction
 * against this text, because the whole trust model is "the span is really in there".
 */
const NOTES = [
  "The team reviewed the pricing experiment.",
  "We agreed to switch report pricing to a flat 29 and drop the uplift for now.",
  "Mark raised whether the paywall should move earlier; that was left open for next week.",
  "Eman will look at the checkout drop-off numbers before Friday.",
].join("\n");

const reply = (decisions: unknown[]) => JSON.stringify({ decisions });

describe("parseMined — the verbatim-quote gate", () => {
  it("keeps a settled decision whose quote really is in the notes", () => {
    const { kept, dropped } = parseMined(
      reply([
        {
          decision: "switch report pricing to a flat 29",
          why: "the uplift was not converting",
          topic: "pricing",
          quote: "We agreed to switch report pricing to a flat 29 and drop the uplift for now.",
          settled: true,
        },
      ]),
      NOTES
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].topic).toBe("pricing");
    expect(dropped).toHaveLength(0);
  });

  /**
   * THE MECHANISM THE WHOLE FEATURE RESTS ON.
   *
   * A decision record is the best evidence this corpus holds, and the pressure-tester is
   * exactly where a false positive costs most — telling someone "we decided the opposite
   * in June" when June was a passing remark is how proactivity stops being trusted. A
   * fabricated decision cannot produce a span that is really in the notes, so this catches
   * invention completely, and it is a string comparison rather than an instruction the
   * model may or may not honour.
   */
  it("drops a decision whose quote is NOT in the notes, however plausible it reads", () => {
    const { kept, dropped } = parseMined(
      reply([
        {
          decision: "move the paywall to the third question",
          topic: "paywall",
          quote: "We decided to move the paywall to the third question.",
          settled: true,
        },
      ]),
      NOTES
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toBe("the quote is not in the notes");
  });

  it("tolerates reflowed whitespace, because a model rewraps even when it copies", () => {
    const { kept } = parseMined(
      reply([
        {
          decision: "switch report pricing to a flat 29",
          topic: "pricing",
          quote: "We agreed to switch report pricing\n   to a flat 29 and drop the uplift for now.",
          settled: true,
        },
      ]),
      NOTES
    );
    expect(kept).toHaveLength(1);
  });

  it("drops an unsettled item rather than recording a weaker decision", () => {
    // A discussed-but-open item is not a lesser decision, it is not a decision. Writing
    // it down as one is the failure mode this gate exists for.
    const { kept, dropped } = parseMined(
      reply([
        {
          decision: "move the paywall earlier",
          topic: "paywall",
          quote:
            "Mark raised whether the paywall should move earlier; that was left open for next week.",
          settled: false,
        },
      ]),
      NOTES
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toBe("not settled");
  });

  it("drops a decision with no quote at all", () => {
    const { kept, dropped } = parseMined(
      reply([{ decision: "do the thing", topic: "other", settled: true }]),
      NOTES
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toBe("no quote");
  });

  it(`caps a meeting at ${MAX_PER_MEETING}, because a call that settled nine things settled none`, () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      decision: `decision ${i}`,
      topic: "other",
      quote: "The team reviewed the pricing experiment.",
      settled: true,
    }));
    const { kept, dropped } = parseMined(reply(many), NOTES);
    expect(kept).toHaveLength(MAX_PER_MEETING);
    expect(dropped.filter((d) => d.why.includes("cap"))).toHaveLength(3);
  });

  it("forces an unrecognised topic into the closed set rather than inventing a bucket", () => {
    // An open string yields "pricing" / "price" / "pricing-test" for one subject, after
    // which ordering decisions within a topic returns one of three partial histories.
    const { kept } = parseMined(
      reply([
        {
          decision: "x",
          topic: "pricing-experiments",
          quote: "The team reviewed the pricing experiment.",
          settled: true,
        },
      ]),
      NOTES
    );
    expect(kept[0].topic).toBe("other");
    expect(TOPICS).toContain(kept[0].topic);
  });

  it("reports unparseable output instead of silently finding nothing", () => {
    const { kept, dropped } = parseMined("I could not find any decisions.", NOTES);
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toContain("did not return JSON");
  });

  it("reads JSON the model wrapped in a code fence", () => {
    const fenced =
      "```json\n" +
      reply([
        {
          decision: "x",
          topic: "pricing",
          quote: "The team reviewed the pricing experiment.",
          settled: true,
        },
      ]) +
      "\n```";
    expect(parseMined(fenced, NOTES).kept).toHaveLength(1);
  });
});

describe("buildMinedRows — provenance, which is not optional", () => {
  const doc = {
    sourceId: "drive/doc:abc",
    title: "LoveIQ Sync",
    text: NOTES,
    decidedOn: "2026-06-12",
    editedAt: null,
    people: ["Mark Oldenburg"],
  };
  const mined = [
    {
      decision: "switch report pricing to a flat 29",
      topic: "pricing" as const,
      quote: "We agreed to switch report pricing to a flat 29 and drop the uplift for now.",
      settled: true,
    },
  ];

  it("marks the row as reconstructed, and says where from", () => {
    /**
     * The server's instructions promise a decision record is "deliberate rather than
     * reconstructed from a transcript", so mining without saying so breaks that promise
     * for every consumer of every decision.
     */
    const [row] = buildMinedRows(doc, mined, new Date("2026-09-12T00:00:00Z"));
    expect(row.meta.origin).toBe("mined");
    expect(row.meta.mined_from).toBe("drive/doc:abc");
    expect(row.meta.miner_v).toBe(MINER_VERSION);
    expect(row.meta.quote).toBe(mined[0].quote);
    expect(row.body).toContain("Reconstructed from meeting notes");
  });

  it("never attributes a mined decision to a named person", () => {
    // Attendance is not authorship. The person who said a sentence in a call is not
    // necessarily the one who decided, and guessing is worse than not attributing.
    const [row] = buildMinedRows(doc, mined, new Date("2026-09-12T00:00:00Z"));
    expect(row.meta.actor).toBe("meeting notes, 2026-06-12");
    expect(String(row.meta.actor)).not.toContain("Mark");
  });

  it("dates the decision from the meeting, not from the day it was mined", () => {
    const [row] = buildMinedRows(doc, mined, new Date("2026-09-12T00:00:00Z"));
    expect(row.meta.decided_on).toBe("2026-06-12");
    expect(row.period_end).toBe("2026-06-12");
  });

  it("gives the same decision the same id, so re-mining updates rather than forks", () => {
    const a = buildMinedRows(doc, mined, new Date("2026-09-12T00:00:00Z"))[0];
    const b = buildMinedRows(doc, mined, new Date("2026-10-01T00:00:00Z"))[0];
    expect(a.source_id).toBe(b.source_id);
  });

  it("keeps the decision itself in the title, where ranking weighs it double", () => {
    const [row] = buildMinedRows(doc, mined, new Date("2026-09-12T00:00:00Z"));
    expect(row.title).toBe("Decision: switch report pricing to a flat 29");
    // NOT prefixed with "Mined:" — a provenance prefix in the title would dilute the
    // words a searcher actually types, which is the reason the title holds the decision.
    expect(row.title.startsWith("Decision:")).toBe(true);
  });
});
