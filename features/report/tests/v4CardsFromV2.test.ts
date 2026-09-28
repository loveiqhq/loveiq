import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/report/preview/route";
import type { Report3Block } from "@/data/report3-learn-more";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { REPORT_V4_CHAPTER_BY_ID } from "@features/report/ui/v3/reportV3Nav";
import {
  V4_ARTICLE_LABEL,
  V4_PRACTICE_TITLE,
  v4CardsFromV2,
} from "@features/report/ui/v3/v4CardsFromV2";

/**
 * Review 27.09, Mark: "show the report 2.0 version in the other chapters that we don't
 * open by default. Please make sure that the practical and learn more elements are
 * according to the new design." In those chapters Report 2.0's own practical panel
 * (gold) and "Learn:" panel (purple) become V4's "Try this & see what shifts" and "Go
 * deeper & learn more" cards, filled with the same 2.0 copy. This mapper builds the
 * cards from the payload and takes each panel's copy off its section, so the 2.0
 * section's own guard skips the panel: no V2 component changes.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
});
afterEach(() => {
  if (SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});
afterAll(() => {
  expect(process.env.NEXT_PUBLIC_SITE_URL).toBe(SITE_URL);
});

const textOf = (blocks: readonly Report3Block[]) =>
  blocks
    .flatMap((b) =>
      b.kind === "heading"
        ? [b.text]
        : b.kind === "para"
          ? b.runs.map((r) => r.text)
          : b.items.flat().map((r) => r.text)
    )
    .join(" ");

const POWER = {
  "edu.eyebrow": "Learn: leading and yielding",
  "edu.teaser": "In sex, one person usually sets the pace.",
  "edu.body.p1": "Leading: setting the pace.",
  "edu.body.p2": "Yielding has its own power.",
  "edu.body.p3": null,
  "edu.body.p4": null,
  "learn.eyebrow": "What you will learn",
  "learn.body": "Where you sit between leading and yielding.",
  takeaway: "Power works on you as play.",
  "body.p1": "Leading happens when momentum grabs you.",
  zone: "Devotional switch",
  locked: false,
};

const INSECURITIES = {
  "practical.label": "Working with your sensitivity: three moves",
  "practical.teaser": "Three small moves.",
  "practical.line1": "1. Name it.",
  "practical.line2": "2. Say it.",
  "practical.line3": "3. Ask for it.",
  "learn.body": "What sexual insecurity is.",
  takeaway: "Sensitivity is information.",
  "body.p1": "Your sensitivity paragraph.",
  locked: false,
};

describe("v4CardsFromV2 — what it takes off each 2.0 section", () => {
  it("passes a missing or locked copy through untouched, with no card", () => {
    const locked = { ...POWER, locked: true };
    const { copies, cards } = v4CardsFromV2({ powerCopy: locked, insecuritiesCopy: null });
    expect(copies.powerCopy).toBe(locked);
    expect(copies.insecuritiesCopy).toBeNull();
    expect(cards.size).toBe(0);
  });

  it("takes exactly a 'Learn:' panel's copy off its section, and nothing else", () => {
    const { copies } = v4CardsFromV2({ powerCopy: POWER });
    const power = copies.powerCopy!;
    expect(power["edu.teaser"]).toBeNull();
    expect(power["edu.body.p1"]).toBeNull();
    expect(power["edu.body.p2"]).toBeNull();
    for (const kept of ["edu.eyebrow", "takeaway", "body.p1", "zone"]) {
      expect(power[kept as keyof typeof power], kept).toBe(POWER[kept as keyof typeof POWER]);
    }
    expect(power.locked).toBe(false);
  });

  // Mark, 28.09: "can we take out the 'what you will learn' text sections from the V2
  // report chapters. This is the equivalent of the new teaser texts."
  it("takes 'What you will learn' off every unlocked copy, with a card or without", () => {
    const growth = {
      "learn.eyebrow": "What you will learn",
      "learn.body": "Growth.",
      locked: false,
    };
    const { copies } = v4CardsFromV2({ powerCopy: POWER, growthCopy: growth });
    for (const copy of [copies.powerCopy!, copies.growthCopy!]) {
      expect(copy["learn.eyebrow"]).toBeNull();
      expect(copy["learn.body"]).toBeNull();
    }
  });

  it("leaves 'What you will learn' on a locked copy, beside its paywall", () => {
    const locked = { ...POWER, locked: true };
    const { copies } = v4CardsFromV2({ powerCopy: locked });
    expect(copies.powerCopy!["learn.body"]).toBe(POWER["learn.body"]);
  });

  it("takes exactly a practical panel's copy off its section, keeping its label", () => {
    const { copies } = v4CardsFromV2({ insecuritiesCopy: INSECURITIES });
    const copy = copies.insecuritiesCopy!;
    for (const key of [
      "practical.teaser",
      "practical.line1",
      "practical.line2",
      "practical.line3",
    ]) {
      expect(copy[key as keyof typeof copy], key).toBeNull();
    }
    expect(copy["practical.label"]).toBe(INSECURITIES["practical.label"]);
    expect(copy.takeaway).toBe(INSECURITIES.takeaway);
    expect(copy["body.p1"]).toBe(INSECURITIES["body.p1"]);
  });

  it("keeps the copy that sits outside the panels: chart notes and stats", () => {
    const energy = { "edu.teaser": "t", "edu.body.p1": "p", chartnote1: "note", locked: false };
    const reward = { "edu.teaser": "t", "edu.body.p1": "p", stat1: "1 in 2", locked: false };
    const { copies } = v4CardsFromV2({ energyCopy: energy, rewardCopy: reward });
    expect(copies.energyCopy!.chartnote1).toBe("note");
    expect(copies.rewardCopy!.stat1).toBe("1 in 2");
  });
});

describe("v4CardsFromV2 — the Go deeper article", () => {
  it("fills V4's article from the 2.0 panel: fixed label, reading time, teaser then body, nothing gated", () => {
    const article = v4CardsFromV2({ powerCopy: POWER }).cards.get("power_orientation")!.article!;
    expect(article.label).toBe(V4_ARTICLE_LABEL);
    expect(article.label).toBe("Learn more & go deeper");
    expect(article.eyebrow).toBe("Reading time: ~1 min.");
    expect(article.free[0]).toEqual({ kind: "para", runs: [{ text: POWER["edu.teaser"] }] });
    expect(textOf(article.free)).toContain("Yielding has its own power.");
    expect(article.gated).toBeNull();
    expect(article.gatedBlockCount).toBe(0);
    // No teaser of its own: closed, the card opens on the teaser and the first
    // paragraph, as 2.0's peek did.
    expect(article.teaser).toBeUndefined();
  });

  it("reads 200 words a minute, and never less than one", () => {
    const long = {
      "edu.teaser": Array.from({ length: 450 }, () => "word").join(" "),
      locked: false,
    };
    expect(
      v4CardsFromV2({ powerCopy: long }).cards.get("power_orientation")!.article!.eyebrow
    ).toBe("Reading time: ~3 min.");
  });

  it("bolds a paragraph's label as Report 2.0 does, and only a label", () => {
    const { free } = v4CardsFromV2({ powerCopy: POWER }).cards.get("power_orientation")!.article!;
    expect(free[1]).toEqual({
      kind: "para",
      runs: [{ text: "Leading", weight: 700 }, { text: ": setting the pace." }],
    });
    expect(free[2]).toEqual({ kind: "para", runs: [{ text: "Yielding has its own power." }] });
  });

  it("sets 2.0's '• ' lines as a list under their lead", () => {
    const copy = { "edu.body.p1": "Signs of it:\n• One thing\n• Another", locked: false };
    const { free } = v4CardsFromV2({ confidenceCopy: copy }).cards.get(
      "confidence_level"
    )!.article!;
    expect(free).toEqual([
      { kind: "para", runs: [{ text: "Signs of it:" }] },
      { kind: "list", items: [[{ text: "One thing" }], [{ text: "Another" }]] },
    ]);
  });

  it("carries Curiosity's structures as a list, each name bold with its colon", () => {
    const copy = {
      "edu.teaser": "Curiosity and structure.",
      "edu.struct.1": "Monogamy: one partner.",
      "edu.struct.2": "Open: more than one.",
      locked: false,
    };
    const { copies, cards } = v4CardsFromV2({ curiosityCopy: copy });
    const list = cards.get("curiosity_level")!.article!.free.at(-1)!;
    expect(list).toEqual({
      kind: "list",
      items: [
        [{ text: "Monogamy:", weight: 700 }, { text: " one partner." }],
        [{ text: "Open:", weight: 700 }, { text: " more than one." }],
      ],
    });
    expect(copies.curiosityCopy!["edu.struct.1"]).toBeNull();
  });

  it("carries Attachment's five patterns, which 2.0 drew inside its panel", () => {
    const copy = { "edu.teaser": "Five patterns.", "edu.body.p1": "Secure: safe.", locked: false };
    const { free } = v4CardsFromV2({ attachmentCopy: copy }).cards.get(
      "attachment_style"
    )!.article!;
    const headings = free.filter((b) => b.kind === "heading");
    expect(headings).toHaveLength(6);
    expect(textOf(free)).toContain("Associated Archetypes:");
    expect(textOf(free)).toContain("Spark Seeker");
  });
});

describe("v4CardsFromV2 — the Try this card", () => {
  it("fills V4's practice from the 2.0 panel: its label as the eyebrow, its lines as written", () => {
    const practice = v4CardsFromV2({ insecuritiesCopy: INSECURITIES }).cards.get(
      "core_insecurities"
    )!.practice!;
    expect(practice.title).toBe(V4_PRACTICE_TITLE);
    expect(practice.title).toBe("Try this & see what shifts");
    expect(practice.eyebrow).toBe("Working with your sensitivity: three moves");
    expect(practice.locked).toBe(false);
    expect(practice.free.map((b) => (b.kind === "para" ? b.runs[0]!.text : ""))).toEqual([
      "Three small moves.",
      "1. Name it.",
      "2. Say it.",
      "3. Ask for it.",
    ]);
    expect(practice.ramp).toBeNull();
    expect(practice.rest).toEqual([]);
  });

  it("falls back to 2.0's own label where the copy has none", () => {
    const copy = { "practical.teaser": "Leave the loop.", locked: false };
    expect(
      v4CardsFromV2({ libidoCopy: copy }).cards.get("libido_challenges_in_relationships")!.practice!
        .eyebrow
    ).toBe("The Exit");
  });
});

describe("v4CardsFromV2 — against the real copy", () => {
  const KEYS = [
    "insecuritiesCopy",
    "libidoCopy",
    "initiationCopy",
    "confidenceCopy",
    "powerCopy",
    "rewardCopy",
    "arousalCopy",
    "energyCopy",
    "attachmentCopy",
    "lovelangCopy",
    "curiosityCopy",
    "beliefsCopy",
    "accelCopy",
    "fantasyCopy",
    "partnershipCopy",
  ] as const;

  it("makes one non-empty card for each of the fifteen chapters, for all fourteen archetypes", async () => {
    for (const archetype of KNOWN_ARCHETYPES) {
      const res = await GET(
        new Request(
          `http://localhost:3000/api/report/preview?archetype=${encodeURIComponent(archetype)}&plan=full_report&v4=1`
        )
      );
      const json = (await res.json()) as Record<string, unknown>;
      const input = Object.fromEntries(KEYS.map((key) => [key, json[key] ?? null]));
      const { cards } = v4CardsFromV2(input);
      expect(cards.size, archetype).toBe(15);
      for (const [chapter, set] of cards) {
        expect(REPORT_V4_CHAPTER_BY_ID.has(chapter), chapter).toBe(true);
        const blocks = set.practice?.free ?? set.article?.free ?? [];
        expect(textOf(blocks).length, `${archetype} ${chapter}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("v4CardsFromV2 — paid copy stays on the server", () => {
  it("imports only types from the paid modules", () => {
    const source = readFileSync(
      join(process.cwd(), "features/report/ui/v3/v4CardsFromV2.ts"),
      "utf8"
    );
    const imports = source.match(/^import[^;]+;/gm) ?? [];
    for (const line of imports) {
      if (/from "(@\/data\/report3-|@features\/report\/server\/)/.test(line)) {
        expect(line, line).toMatch(/^import type /);
      }
    }
  });
});
