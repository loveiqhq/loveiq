import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { getReport2Section } from "@/data/report2";
import { READING_SOURCES, getReadingSource, readingHref } from "@/data/report2-reading-links";

const COVER_DIR = path.join(process.cwd(), "public", "report", "books");

/** Every book title the copy matrix ships, across all 14 archetypes. */
const titles = Object.entries(config as Record<string, { name?: string }>)
  .filter(([slug, v]) => !slug.startsWith("_") && !!v?.name)
  .flatMap(([, v]) => {
    const copy = getReport2Section(v.name!, "reading") as Record<string, string | undefined>;
    return ([1, 2, 3, 4] as const)
      .map((i) => ({
        title: copy[`book${i}.title`]?.trim(),
        author: copy[`book${i}.author`]?.trim(),
      }))
      .filter((b): b is { title: string; author: string | undefined } => !!b.title);
  });

describe("report2 reading links", () => {
  it("resolves a source for every title in the copy matrix", () => {
    expect(titles.length).toBeGreaterThan(40);
    const unknown = titles.filter((b) => !getReadingSource(b.title)).map((b) => b.title);
    expect(unknown, "titles with no cover/destination entry").toEqual([]);
  });

  it("ships every referenced cover file", () => {
    const onDisk = new Set(fs.readdirSync(COVER_DIR));
    for (const [key, src] of Object.entries(READING_SOURCES)) {
      if (!src.cover) continue;
      expect(onDisk.has(src.cover), `${key} → missing ${src.cover}`).toBe(true);
      // Intrinsic size must travel with the file so the card reserves its box.
      expect(src.w, `${key} width`).toBeGreaterThan(0);
      expect(src.h, `${key} height`).toBeGreaterThan(0);
      // The card holds Figma's cover WIDTH and takes height from this ratio, so an
      // extreme jacket would stretch the row. Real covers sit between square
      // audiobook art and a tall trade paperback.
      const ratio = src.w! / src.h!;
      expect(ratio, `${key} aspect ratio ${src.w}x${src.h}`).toBeGreaterThan(0.55);
      expect(ratio, `${key} aspect ratio ${src.w}x${src.h}`).toBeLessThan(1.05);
    }
  });

  it("leaves no orphaned cover files in public/report/books", () => {
    const referenced = new Set(
      Object.values(READING_SOURCES)
        .map((s) => s.cover)
        .filter(Boolean)
    );
    const orphans = fs.readdirSync(COVER_DIR).filter((f) => !referenced.has(f));
    expect(orphans, "cover files nothing links to").toEqual([]);
  });

  it("folds the matrix's two 'Come As You Are' spellings onto one book", () => {
    // The matrix ships both capitalisations for the same Emily Nagoski title.
    expect(getReadingSource("Come As You Are")).toBe(getReadingSource("Come as You Are"));
    expect(getReadingSource("Come As You Are")?.cover).toBe("come-as-you-are.jpg");
  });

  it("sends academic sources to their DOI and books to an Amazon book search", () => {
    expect(readingHref("Intimacy & Human Functioning", "Popović · journal paper")).toBe(
      "https://doi.org/10.1080/14681990412331323992"
    );
    const href = readingHref("Urban Tantra", "Barbara Carrellas · 2007");
    expect(href).toBe(
      "https://www.amazon.com/s?k=Urban%20Tantra%20Barbara%20Carrellas%20%C2%B7%202007&i=stripbooks"
    );
    // Every destination must be a real absolute https URL.
    for (const b of titles) expect(readingHref(b.title, b.author ?? null)).toMatch(/^https:\/\//);
  });

  it("keeps the coverless titles to the ones with no jacket on file", () => {
    const coverless = Object.entries(READING_SOURCES)
      .filter(([, s]) => !s.cover)
      .map(([k]) => k)
      .sort();
    expect(coverless).toEqual([
      "anchored",
      "being responsive and self determined when it comes to sex",
      "intimacy human functioning",
      "keeping the spark alive sexual communal motivation",
      "psychological characteristics of bdsm practitioners",
      "sex specific need fulfilment in relationships",
      "the science of trust",
    ]);
  });
});
