import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { adfToText } from "@features/brain/server/ingest/jira";

/**
 * Jira Cloud API v3 returns `fields.description` as Atlassian Document Format —
 * nested JSON, not text. Indexing the raw JSON would fill the corpus with
 * structural keywords ("paragraph", "content", "type") that match every query.
 */
describe("adfToText", () => {
  it("extracts text from a simple paragraph", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Checkout starts collapsed" }] },
      ],
    };
    expect(adfToText(adf).trim()).toBe("Checkout starts collapsed");
  });

  it("keeps paragraphs on separate lines rather than running them together", () => {
    const adf = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second." }] },
      ],
    };
    expect(adfToText(adf).trim()).toBe("First.\nSecond.");
  });

  it("flattens list items onto their own lines", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };
    const out = adfToText(adf);
    expect(out).toContain("one");
    expect(out).toContain("two");
    expect(out.indexOf("one")).toBeLessThan(out.indexOf("two"));
    expect(out.trim().split("\n").filter(Boolean).length).toBeGreaterThan(1);
  });

  it("concatenates inline marks into one sentence", () => {
    // Bold/italic are marks on adjacent text nodes; they must not introduce breaks.
    const adf = {
      type: "paragraph",
      content: [
        { type: "text", text: "this is " },
        { type: "text", text: "important", marks: [{ type: "strong" }] },
        { type: "text", text: " to fix" },
      ],
    };
    expect(adfToText(adf).trim()).toBe("this is important to fix");
  });

  it("reads text out of nested tables and panels", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "cell value" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToText(adf)).toContain("cell value");
  });

  it("returns an empty string for null, undefined and an empty doc", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
    expect(adfToText({ type: "doc", content: [] })).toBe("");
  });

  it("survives a plain string or a number where a node was expected", () => {
    expect(adfToText("already text")).toBe("already text");
    expect(adfToText(42)).toBe("");
  });

  it("does not leak structural keywords into the output", () => {
    const adf = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "real content" }] }],
    };
    const out = adfToText(adf);
    expect(out).not.toContain("paragraph");
    expect(out).not.toContain("doc");
    expect(out).not.toContain("type");
  });

  it("stops rather than recursing forever on a self-referencing document", () => {
    // A malformed or hostile payload must not blow the stack.
    const node: Record<string, unknown> = { type: "paragraph" };
    node.content = [node];
    expect(() => adfToText(node)).not.toThrow();
  });
});
