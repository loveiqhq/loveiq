import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/report/preview/route";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { REPORT_V4_SUMMARY } from "@/data/report3-summary";

/**
 * The slimmed report's Part II locks (16.10), through `/api/report/preview`, which gates
 * every section exactly as the real route does. The card's dimensions and the Summary sit
 * behind the Summary's own gate: Essentials opens it, as it opens the chapter.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

const get = async (query: string) => {
  const res = await GET(new Request(`http://localhost:3000/api/report/preview?${query}`));
  return { status: res.status, json: await res.json() };
};

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

describe("GET /api/report/preview — Part II, slimmed", () => {
  it("half-locks the card and the Summary for a reader with no plan", async () => {
    const { status, json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(status).toBe(200);
    expect(json.archetypeCard.locked).toBe(true);
    expect(json.archetypeCard).not.toHaveProperty("tagline");
    for (const d of json.archetypeCard.dimensions) expect(d.veiled).toBeTruthy();
    expect(json.summaryChapter.locked).toBe(true);
    expect(json.summaryChapter.paragraphs).toHaveLength(2);
    // The Summary's last paragraph never leaves the server for a locked reader.
    const last = REPORT_V4_SUMMARY["Spark Seeker"]!.paragraphs.at(-1)!;
    expect(JSON.stringify(json)).not.toContain(
      last
        .map((r) => r.text)
        .join("")
        .slice(0, 40)
    );
  });

  it.each(["essentials", "full_report"])("opens both for %s", async (plan) => {
    const { json } = await get(`archetype=Spark%20Seeker&plan=${plan}&v4=1`);
    expect(json.archetypeCard.locked).toBe(false);
    expect(json.archetypeCard.dimensions).toEqual(report3ArchetypeCard["Spark Seeker"]!.dimensions);
    expect(json.summaryChapter).toMatchObject({ locked: false, ramp: null });
    expect(json.summaryChapter.paragraphs).toEqual(REPORT_V4_SUMMARY["Spark Seeker"]!.paragraphs);
  });

  it("sends neither to a report that is not V4", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=");
    expect(json.archetypeCard).toBeNull();
    expect(json.summaryChapter).toBeNull();
  });
});
