/**
 * The book library (scripts/brain-books.ts): every part must fit the write cap WITH the
 * line that says it is someone else's work. A head added after sizing is cut off the end
 * of the part at the cap, silently, which has happened twice in this codebase.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { BOOKS, bookRows, cleanBookText, partHead } from "@/scripts/brain-books";
import { MAX_BODY_CHARS } from "@features/brain/server/ingest/upsert";

const book = BOOKS.find((b) => b.title === "Mating in Captivity")!;

describe("bookRows", () => {
  // Longer than the cap many times over, with no paragraph breaks to cut at.
  const text = "desire ".repeat(40_000);
  const rows = bookRows(book, text, "2026-09-28T00:00:00.000Z");

  it("fits every part, head included, under the write cap", () => {
    expect(rows.length).toBeGreaterThan(100);
    for (const r of rows) expect(r.body.length).toBeLessThanOrEqual(MAX_BODY_CHARS);
  });

  it("says in every part whose work it is, and which part it is", () => {
    rows.forEach((r, i) => {
      expect(r.body.startsWith(partHead(book, i + 1, rows.length))).toBe(true);
      expect(r.body).toContain("not LoveIQ's own claim");
    });
  });

  it("keeps the whole book, not the first 400,000 characters", () => {
    const stored = rows.map((r) => r.body.slice(r.body.indexOf("\n") + 1)).join(" ");
    expect(stored.replace(/\s+/g, "").length).toBe(text.replace(/\s+/g, "").length);
  });

  it("files every part under source book, ids and titles like the Drive parts", () => {
    expect(rows.every((r) => r.source === "book")).toBe(true);
    expect(rows[0]!.source_id).toBe(`book:${book.id}`);
    expect(rows[1]!.source_id).toBe(`book:${book.id}#2`);
    expect(rows[0]!.title).toBe("Book: Mating in Captivity, Esther Perel");
    expect(rows[1]!.title).toBe(
      `Book: Mating in Captivity, Esther Perel (part 2 of ${rows.length})`
    );
    expect(rows[1]!.meta).toMatchObject({ kind: "book", author: "Esther Perel", part: 2 });
  });
});

describe("cleanBookText", () => {
  it("drops control characters and folds spaces but keeps paragraph breaks", () => {
    expect(cleanBookText("one\u0000  two\t three\n\n\n\nfour  \n  five")).toBe(
      "one two three\n\nfour\nfive"
    );
  });
});
