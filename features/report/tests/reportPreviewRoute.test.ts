import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/report/preview/route";

/**
 * `/api/report/preview` — the report with no database behind it (`?preview=1`),
 * staging and local only. It must gate every section exactly as the real route
 * does, so a locked preview is an honest picture of a locked report.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const AB_PROBES = [
  "Control and possessiveness",
  "Spontaneity and controlled unpredictability",
  "A suggestive message on Wednesday",
  "Respect brakes that are protecting something real.",
];

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

// Leave the variable exactly as the file found it. Assigning `undefined` to
// process.env stores the STRING "undefined", which every later file in the worker
// would then read as a site URL.
afterAll(() => {
  expect(process.env.NEXT_PUBLIC_SITE_URL).toBe(SITE_URL);
  expect("NEXT_PUBLIC_SITE_URL" in process.env).toBe(SITE_URL !== undefined);
});

describe("GET /api/report/preview — Accelerator & Brakes", () => {
  it("locks the chapter for a reader with no plan, with nothing paid past the wall", async () => {
    const { status, json } = await get("archetype=Spark%20Seeker&plan=");
    expect(status).toBe(200);
    expect(json.accelerators.lockedFrom).toBe(2);
    expect(json.acceleratorsArticle.locked).toBe(true);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).not.toContain(probe);
  });

  it("opens every word for a full-report preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=full_report");
    expect(json.accelerators.lockedFrom).toBeNull();
    expect(json.acceleratorsArticle.locked).toBe(false);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).toContain(probe);
  });

  it("sends V2's section copy too, so the chapter is no longer an empty head in the preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=");
    expect(json.accelCopy).toMatchObject({ locked: true, takeaway: null });
    expect(json.accelCopy["edu.eyebrow"]).toEqual(expect.any(String));
  });

  it("falls back to V2 for an archetype without Report 3.0 copy", async () => {
    const { json } = await get("archetype=emotional-voyeur&plan=");
    expect(json.accelerators).toBeNull();
    expect(json.acceleratorsArticle).toBeNull();
    expect(json.accelCopy).not.toBeNull();
  });

  it("is not found on production", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    const { status } = await get("archetype=Spark%20Seeker&plan=full_report");
    expect(status).toBe(404);
  });
});
