import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/report/preview/route";
import { getReport2Section } from "@/data/report2";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";

/**
 * `/api/report/preview` — the report with no database behind it (`?preview=1`),
 * staging and local only. It must gate every section exactly as the real route
 * does, so a locked preview is an honest picture of a locked report.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const AB_PROBES = [
  "Low-energy, passive encounters",
  "Spontaneity and controlled unpredictability",
  // Past Common challenges' ramp paragraph, which fades in whole and is sent as written
  // since 314:284 (29.09), as in report-handler.test.ts.
  "common brakes is sex that feels predictable",
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

describe("GET /api/report/preview — no reader behind it", () => {
  // Marcus (04.10): Refer a friend opened with "Preview" as the sender's name. A preview
  // has no reader, so it sends no name and the form starts empty for the person to fill.
  it("sends no reader's name", async () => {
    const { status, json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(status).toBe(200);
    expect(json.userName).toBeNull();
  });
});

describe("GET /api/report/preview — Accelerator & Brakes", () => {
  // Review 26.09 (lockedBlurCopy.ts): a locked reader's page carries the copy it
  // draws blurred — "the unlocked content but blurred" — still marked locked.
  it("locks the chapter for a reader with no plan, the blurred copy as written", async () => {
    const { status, json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(status).toBe(200);
    expect(json.accelerators.lockedFrom).toBe(2);
    expect(json.acceleratorsArticle.locked).toBe(true);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).toContain(probe);
  });

  it("opens every word for a full-report preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    expect(json.accelerators.lockedFrom).toBeNull();
    expect(json.acceleratorsArticle.locked).toBe(false);
    const body = JSON.stringify(json);
    for (const probe of AB_PROBES) expect(body, probe).toContain(probe);
  });

  it("sends V2's section copy too, so the chapter is no longer an empty head in the preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(json.accelCopy).toMatchObject({ locked: true, takeaway: null });
    expect(json.accelCopy["edu.eyebrow"]).toEqual(expect.any(String));
  });

  // Every archetype has its own chapter since 02.10 (Sanjin's docs, data/report3-copy).
  it("draws another archetype's own chapter, locked, V2's copy beside it", async () => {
    const { json } = await get("archetype=emotional-voyeur&plan=&v4=1");
    expect(json.accelerators).not.toBeNull();
    expect(json.accelerators.lockedFrom).not.toBeNull();
    expect(json.acceleratorsArticle).toMatchObject({ locked: true });
    expect(json.accelCopy).not.toBeNull();
  });

  it("is not found on production", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    const { status } = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    expect(status).toBe(404);
  });
});

// Review 24.09: "The other Archetypes should not be the constellation, but the larger
// list of other archetypes of the Report V2". 2.0's list ranks all fourteen, each with
// its motto; the preview sent only the frame's three percentages and no mottos, so on
// staging V4's Other Archetypes drew three bare rows — a repeat of the top-three card.
describe("GET /api/report/preview — the V4 chapters only reach the V4 page", () => {
  // Final review 26.09: as on the real route, a request that is not V4's (the
  // default report, V2, V3) carries none of V4's chapters or their articles.
  it("sends a preview that is not V4 none of them", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=");
    for (const key of [
      "typicalBeliefs",
      "typicalBeliefsArticle",
      "accelerators",
      "acceleratorsArticle",
      "partnership",
      "fantasy",
      "fantasyArticle",
    ]) {
      expect(json[key], key).toBeNull();
    }
    for (const probe of AB_PROBES) expect(JSON.stringify(json), probe).not.toContain(probe);
    // V2's own sections are there as before.
    expect(json.accelCopy).not.toBeNull();
  });
});

describe("GET /api/report/preview — Other Archetypes", () => {
  const ranked = (json: { percentages: Record<string, number> }) =>
    Object.entries(json.percentages).sort(([, a], [, b]) => b - a);

  it("ranks all fourteen archetypes, keeping the frame's top three", async () => {
    const { json } = await get("archetype=Spark%20Seeker");
    const rows = ranked(json);
    expect(rows).toHaveLength(14);
    expect(new Set(rows.map(([name]) => name))).toEqual(new Set(KNOWN_ARCHETYPES));
    expect(rows.slice(0, 3)).toEqual([
      ["Spark Seeker", 43.4],
      ["Explorer of Edges", 39.5],
      ["Emotional Voyeur", 36.2],
    ]);
    // Strictly descending, so the order is the ranking and never a tie.
    expect(new Set(rows.map(([, pct]) => pct)).size).toBe(14);
  });

  it("puts the requested archetype first, rather than tying it with Spark Seeker", async () => {
    const { json } = await get("archetype=quiet-withdrawer");
    const rows = ranked(json);
    expect(rows[0]).toEqual(["Quiet Withdrawer", 43.4]);
    expect(rows).toHaveLength(14);
  });

  it("sends every archetype's motto, built as the real route builds them", async () => {
    const { json } = await get("archetype=Spark%20Seeker");
    for (const name of KNOWN_ARCHETYPES) {
      expect(json.constellationMottos[name], name).toBe(
        getReport2Section(name, "constellation").motto ?? null
      );
    }
  });
});

// The Challenges in Partnerships chapter (Figma 38:1672, 305:350 locked) and V2's
// section it replaces. The preview sent neither, so on staging the V2 section — and
// V4's fallback for the thirteen archetypes still on it — was an empty head.
describe("GET /api/report/preview — Challenges in Partnerships", () => {
  const CIP_PROBES = [
    "Routine can feel different to each partner.",
    "They do not really want me the way they used to.",
    "Intensity is my evidence that love is real",
    "keep the commitment clear while leaving parts of the experience open",
  ];

  it("locks the V4 chapter for a reader with no plan, the blurred copy as written", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(json.partnership.locked).toBe(true);
    expect(json.partnership.practice.locked).toBe(true);
    const body = JSON.stringify(json);
    for (const probe of CIP_PROBES) expect(body, probe).toContain(probe);
  });

  it("keeps it locked on essentials — it is a full-report chapter, Libido's gate", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=essentials&v4=1");
    expect(json.partnership.locked).toBe(true);
    expect(json.partnershipCopy.locked).toBe(true);
  });

  it("opens every word for a full-report preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    expect(json.partnership.locked).toBe(false);
    const body = JSON.stringify(json);
    for (const probe of CIP_PROBES) expect(body, probe).toContain(probe);
  });

  it("sends V2's section copy and loop, gated and edu-stripped as the real route does", async () => {
    const locked = (await get("archetype=Spark%20Seeker&plan=&v4=1")).json;
    expect(locked.partnershipCopy).toMatchObject({
      locked: true,
      result: null,
      "row1.value": null,
    });
    expect(locked.partnershipCopy["edu.eyebrow"]).toEqual(expect.any(String));
    // stripLockedEduBodyFromPayload clips p1 and drops p2/p3 for a locked reader.
    expect(locked.partnershipCopy["edu.body.p2"]).toBeNull();
    expect(locked.partnershipLoop).toBeNull();
    const open = (await get("archetype=Spark%20Seeker&plan=full_report&v4=1")).json;
    expect(open.partnershipCopy.locked).toBe(false);
    expect(open.partnershipCopy.result).toEqual(expect.any(String));
    expect(open.partnershipLoop.steps).toHaveLength(3);
  });

  it("draws another archetype's own chapter, open, V2's copy beside it", async () => {
    const { json } = await get("archetype=emotional-voyeur&plan=full_report&v4=1");
    expect(json.partnership).toMatchObject({ locked: false });
    expect(json.partnershipCopy.locked).toBe(false);
    expect(json.partnershipLoop).not.toBeNull();
  });
});

describe("GET /api/report/preview — Fantasy vs. Reality", () => {
  const FVR_PROBES = [
    "Imagine being watched. In fantasy, the attention is flattering",
    "Finally, think in terms of translation rather than reproduction.",
  ];

  it("locks the V4 chapter and its article for a reader with no plan, the blurred copy as written", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    expect(json.fantasy.locked).toBe(true);
    expect(json.fantasy.table.locked).toBe(true);
    expect(json.fantasyArticle.locked).toBe(true);
    const body = JSON.stringify(json);
    for (const probe of FVR_PROBES) expect(body, probe).toContain(probe);
  });

  it("keeps it locked on essentials — it is a full-report chapter", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=essentials&v4=1");
    expect(json.fantasy.locked).toBe(true);
    expect(json.fantasyCopy.locked).toBe(true);
  });

  it("opens every word for a full-report preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    expect(json.fantasy.locked).toBe(false);
    expect(json.fantasyArticle.locked).toBe(false);
    const body = JSON.stringify(json);
    for (const probe of FVR_PROBES) expect(body, probe).toContain(probe);
  });

  it("sends V2's section copy and map dots, gated and edu-stripped as the real route does", async () => {
    const locked = (await get("archetype=Spark%20Seeker&plan=&v4=1")).json;
    expect(locked.fantasyCopy.locked).toBe(true);
    expect(locked.fantasyCopy["edu.eyebrow"]).toEqual(expect.any(String));
    // stripLockedEduBodyFromPayload clips p1 and drops the rest for a locked reader.
    expect(locked.fantasyCopy["edu.body.p2"]).toBeNull();
    expect(locked.fantasyDots).toBeNull();
    const open = (await get("archetype=Spark%20Seeker&plan=full_report&v4=1")).json;
    expect(open.fantasyCopy.locked).toBe(false);
    expect(open.fantasyDots).not.toBeNull();
  });

  it("draws another archetype's own chapter, open, V2's copy beside it", async () => {
    const { json } = await get("archetype=emotional-voyeur&plan=full_report&v4=1");
    expect(json.fantasy).toMatchObject({ locked: false });
    expect(json.fantasyArticle).toMatchObject({ locked: false });
    expect(json.fantasyCopy.locked).toBe(false);
  });
});

// Review 27.09: Mark reviews through the preview, where every Report 2.0 chapter but
// four opened onto an empty body — the route sent copy for Beliefs, A&B, Partnership
// and Fantasy alone — which is where "show the report 2.0 version in the other
// chapters" began. The preview now builds them through the real route's own builder.
describe("GET /api/report/preview — every Report 2.0 chapter, as the real route sends it", () => {
  const COPIES = [
    "attachmentCopy",
    "insecuritiesCopy",
    "rewardCopy",
    "energyCopy",
    "arousalCopy",
    "initiationCopy",
    "libidoCopy",
    "enjoyCopy",
    "growthCopy",
    "readingCopy",
    "powerCopy",
    "curiosityCopy",
    "lovelangCopy",
    "confidenceCopy",
  ] as const;
  const CONFIGS = [
    "attachmentPlane",
    "energyConfig",
    "arousalConfig",
    "initiationConfig",
    "libidoConfig",
    "relationshipFit",
    "loveLanguageOrder",
  ] as const;

  it("sends a full-report preview every chapter's copy and chart, unlocked", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=full_report&v4=1");
    for (const key of COPIES) {
      expect(json[key], key).toBeTruthy();
      expect(json[key].locked, key).toBe(false);
    }
    for (const key of CONFIGS) expect(json[key], key).toBeTruthy();
    const power = getReport2Section("Spark Seeker", "power");
    expect(json.powerCopy["edu.body.p2"]).toBe(power["edu.body.p2"]);
    expect(json.powerCopy.takeaway).toBe(power.takeaway);
    expect(json.insecuritiesCopy["practical.line1"]).toBeTruthy();
  });

  it("gates them for a preview with no plan, exactly as a locked report", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=&v4=1");
    for (const key of COPIES) expect(json[key].locked, key).toBe(true);
    for (const key of CONFIGS) expect(json[key], key).toBeNull();
    // The "Learn:" bodies come off the wire for a locked section, as on the real route.
    expect(json.powerCopy["edu.body.p2"]).toBeNull();
    expect(json.powerCopy.takeaway).toBeNull();
    expect(json.insecuritiesCopy["practical.line1"]).toBeNull();
  });

  it("opens only the Essentials chapters for an Essentials preview", async () => {
    const { json } = await get("archetype=Spark%20Seeker&plan=essentials&v4=1");
    expect(json.insecuritiesCopy.locked).toBe(false);
    expect(json.confidenceCopy.locked).toBe(false);
    expect(json.attachmentCopy.locked).toBe(false);
    expect(json.powerCopy.locked).toBe(true);
    expect(json.rewardCopy.locked).toBe(true);
  });

  it("builds the chapters for every archetype", async () => {
    for (const archetype of KNOWN_ARCHETYPES) {
      const { json } = await get(`archetype=${encodeURIComponent(archetype)}&plan=full_report`);
      for (const key of COPIES) expect(json[key]?.locked, `${archetype} ${key}`).toBe(false);
      expect(json.growthCopy.takeaway, archetype).toBe(
        getReport2Section(archetype, "growth").takeaway ?? null
      );
    }
  });
});
