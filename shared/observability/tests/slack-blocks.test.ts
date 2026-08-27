import { describe, expect, it } from "vitest";

import {
  context,
  divider,
  fields,
  fitBlocks,
  header,
  linkButtons,
  section,
} from "@shared/observability/slack-blocks";

/** Slack's real caps, restated here so the test fails if the module drifts. */
const SECTION_HARD_LIMIT = 3000;
const BLOCK_HARD_LIMIT = 50;
const MESSAGE_HARD_LIMIT = 40_000;

function assertSendable(blocks: ReturnType<typeof fitBlocks>["blocks"], text: string) {
  expect(blocks.length).toBeLessThanOrEqual(BLOCK_HARD_LIMIT);
  expect(JSON.stringify({ text, blocks }).length).toBeLessThanOrEqual(MESSAGE_HARD_LIMIT);
  for (const block of blocks) {
    const t = block.text as { text?: string } | undefined;
    if (typeof t?.text === "string") expect(t.text.length).toBeLessThanOrEqual(SECTION_HARD_LIMIT);
    const f = block.fields as Array<{ text?: string }> | undefined;
    if (Array.isArray(f)) {
      expect(f.length).toBeLessThanOrEqual(10);
      for (const field of f) {
        // each field has its own 2,000 cap, independent of the section's 3,000
        expect((field.text ?? "").length).toBeLessThanOrEqual(2000);
      }
    }
  }
}

describe("block builders", () => {
  it("builds the shapes Slack expects", () => {
    expect(section("hi")).toEqual({ type: "section", text: { type: "mrkdwn", text: "hi" } });
    expect(divider()).toEqual({ type: "divider" });
    expect(context("note")).toEqual({
      type: "context",
      elements: [{ type: "mrkdwn", text: "note" }],
    });
  });

  it("clamps a header to Slack's 150-char plain_text cap", () => {
    const h = header("x".repeat(400));
    expect((h.text as { text: string }).text).toHaveLength(150);
    expect((h.text as { type: string }).type).toBe("plain_text");
  });

  it("caps fields at Slack's 10 per section", () => {
    const f = fields(Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })));
    expect((f.fields as unknown[]).length).toBe(10);
  });

  it("builds a link button", () => {
    const b = linkButtons([{ text: "Open", url: "https://example.test/x" }]);
    expect((b.elements as Array<{ url: string }>)[0]!.url).toBe("https://example.test/x");
  });

  it("puts several buttons in ONE actions block so Slack lays them out side by side", () => {
    const b = linkButtons([
      { text: "Admin", url: "https://example.test/a" },
      { text: "Recording", url: "https://example.test/b" },
    ]);
    expect((b.elements as unknown[]).length).toBe(2);
  });

  it("slices at Slack's 25-element cap", () => {
    const b = linkButtons(
      Array.from({ length: 30 }, (_, i) => ({ text: `B${i}`, url: `https://example.test/${i}` }))
    );
    expect((b.elements as unknown[]).length).toBe(25);
  });
});

describe("fitBlocks", () => {
  it("passes a normal message through untouched", () => {
    const blocks = [
      header("Purchase"),
      section("a line"),
      fields([{ label: "Plan", value: "core" }]),
    ];
    const result = fitBlocks(blocks, "fallback");
    expect(result.trimmed).toBe(false);
    expect(result.blocks).toHaveLength(3);
    assertSendable(result.blocks, "fallback");
  });

  it("truncates the 3,033-char section that 400d the commit notifier on 2026-08-21", () => {
    const result = fitBlocks([header("Push"), section("x".repeat(3033))], "fallback");
    expect(result.trimmed).toBe(true);
    const text = (result.blocks[1]!.text as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(SECTION_HARD_LIMIT);
    expect(text.endsWith("…")).toBe(true);
    assertSendable(result.blocks, "fallback");
  });

  it("sheds blocks to survive the 48,401-char payload that 400d it on 2026-08-23", () => {
    // 20 verbose commit sections, the real shape of that push.
    const blocks = [
      header("20 commits"),
      ...Array.from({ length: 20 }, () => section("y".repeat(2500))),
    ];
    const before = JSON.stringify({ text: "f", blocks }).length;
    expect(before).toBeGreaterThan(MESSAGE_HARD_LIMIT); // the failure reproduced

    const result = fitBlocks(blocks, "f");
    expect(result.trimmed).toBe(true);
    expect(result.size).toBeLessThanOrEqual(MESSAGE_HARD_LIMIT);
    assertSendable(result.blocks, "f");
  });

  it("enforces the 50-block cap", () => {
    const blocks = [header("many"), ...Array.from({ length: 120 }, (_, i) => section(`row ${i}`))];
    const result = fitBlocks(blocks, "f");
    expect(result.blocks.length).toBeLessThanOrEqual(BLOCK_HARD_LIMIT);
    expect(result.trimmed).toBe(true);
    assertSendable(result.blocks, "f");
  });

  it("keeps the header and says so when it drops detail, rather than trimming silently", () => {
    const blocks = [header("Kept"), ...Array.from({ length: 80 }, (_, i) => section(`row ${i}`))];
    const result = fitBlocks(blocks, "f");
    expect(result.blocks[0]).toEqual(header("Kept"));
    const last = result.blocks.at(-1)!.text as { text: string };
    expect(last.text).toContain("omitted");
  });

  it("counts the fallback text toward the message budget", () => {
    // A huge fallback string is itself part of the payload Slack measures.
    const blocks = [header("h"), ...Array.from({ length: 15 }, () => section("z".repeat(2400)))];
    const hugeText = "t".repeat(30_000);
    const result = fitBlocks(blocks, hugeText);
    expect(result.size).toBeLessThanOrEqual(MESSAGE_HARD_LIMIT);
    assertSendable(result.blocks, hugeText);
  });

  it("leaves a legal fields block alone — each field caps at 2,000, they do not sum", () => {
    // 10 fields x 500 chars is 5,000 combined but perfectly legal: Slack caps each
    // field independently. An earlier version of fitBlocks summed them against the
    // 3,000 section cap, so it reported a trim it had not actually performed.
    const legal = fields(
      Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, value: "q".repeat(500) }))
    );
    const result = fitBlocks([header("h"), legal], "f");
    expect(result.trimmed).toBe(false);
    const first = (result.blocks[1]!.fields as Array<{ text: string }>)[0]!.text;
    expect(first).toContain("q".repeat(500));
    assertSendable(result.blocks, "f");
  });

  it("clamps an individual field that exceeds its own 2,000-char cap", () => {
    const over = fields([{ label: "Big", value: "q".repeat(2500) }]);
    const result = fitBlocks([header("h"), over], "f");
    expect(result.trimmed).toBe(true);
    const text = (result.blocks[1]!.fields as Array<{ text: string }>)[0]!.text;
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text.endsWith("\u2026")).toBe(true);
    assertSendable(result.blocks, "f");
  });

  it("survives an empty block list", () => {
    const result = fitBlocks([], "f");
    expect(result.blocks).toEqual([]);
    expect(result.trimmed).toBe(false);
  });

  it("reports the final size so a caller can log what Slack received", () => {
    const result = fitBlocks([header("h"), section("s")], "fallback");
    expect(result.size).toBe(JSON.stringify({ text: "fallback", blocks: result.blocks }).length);
  });
});
