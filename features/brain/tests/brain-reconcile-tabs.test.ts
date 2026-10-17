import { describe, expect, it, vi } from "vitest";

import { sampleForDay, tabsPresentInText } from "@/app/api/cron/brain-reconcile/route";

/**
 * The check that would have caught the 2026-09-19 spreadsheet bug, in which a file was
 * indexed, counted, and reconciled to the exact document while holding one tab of two.
 * Every other reconciler check compares two numbers we already hold; this is the only
 * one that compares the corpus against the source, so its comparison must be exact.
 */
describe("tabsPresentInText", () => {
  const body = "Business Case\n## Costs\nSlack, 41.25\n## Core_KPI\nPaid Reports, 600";

  it("counts a tab that is really there", () => {
    expect(tabsPresentInText(body, ["Costs", "Core_KPI"])).toBe(2);
  });

  it("does NOT count a tab that is missing — the whole point", () => {
    expect(tabsPresentInText("Business Case\n## Costs\nSlack, 41.25", ["Costs", "Core_KPI"])).toBe(
      1
    );
  });

  it("requires the heading, not a passing mention of the word", () => {
    // A sheet whose cells happen to say "Core_KPI" has not had that tab indexed.
    const mentions = "Business Case\n## Costs\nsee the Core_KPI tab for detail";
    expect(tabsPresentInText(mentions, ["Costs", "Core_KPI"])).toBe(1);
  });

  it("handles a tab name with spaces and punctuation", () => {
    expect(tabsPresentInText("## Q4 Plan (draft)\nrows", ["Q4 Plan (draft)"])).toBe(1);
  });

  it("is zero for an empty corpus body, not an error", () => {
    expect(tabsPresentInText("", ["Costs"])).toBe(0);
  });
});

describe("sampleForDay", () => {
  const all = Array.from({ length: 40 }, (_, i) => `doc${i}`);

  it("checks a different set each day", () => {
    expect(sampleForDay(all, 0, 3)).not.toEqual(sampleForDay(all, 1, 3));
  });

  it("eventually covers EVERY document — the whole point", () => {
    // `sort().slice(0, 3)` checked the same three forever and left 37 unverified.
    const seen = new Set<string>();
    for (let d = 0; d < 40; d++) for (const x of sampleForDay(all, d, 3)) seen.add(x);
    expect(seen.size).toBe(all.length);
  });

  it("returns everything when there is less than a sample's worth", () => {
    expect(sampleForDay(["a", "b"], 5, 3)).toEqual(["a", "b"]);
  });

  it("never returns fewer than asked for, or a hole", () => {
    for (let d = 0; d < 45; d++) {
      const s = sampleForDay(all, d, 3);
      expect(s).toHaveLength(3);
      expect(s.every((x) => typeof x === "string")).toBe(true);
    }
  });

  it("handles a negative day index rather than producing nothing", () => {
    expect(sampleForDay(all, -1, 3)).toHaveLength(3);
  });
});

/**
 * THE CREDENTIAL, which is the part that was wrong and silent.
 *
 * These spreadsheets belong to people, not to the service account, so the service
 * account token is refused with 403 PERMISSION_DENIED on every one of them. Written
 * that way, the check threw on its first file every night, landed in `unread`, and
 * reported "could not read: spreadsheet tabs" — which reads as a missing token rather
 * than as a check that has never once run. It must use the DELEGATED token, the same
 * one the drive ingester uses.
 */
describe("sheetTabReading credential", () => {
  it("delegates, and never reaches for the service-account token", async () => {
    vi.resetModules();
    const delegated = vi.fn(async () => "delegated-token");
    const serviceAccount = vi.fn(async () => {
      throw new Error("the service account token is refused by the Sheets API (403)");
    });
    vi.doMock("@shared/http/google-oauth", () => ({
      DRIVE_SCOPE: "https://www.googleapis.com/auth/drive.readonly",
      getDelegatedToken: delegated,
      getGoogleAccessToken: serviceAccount,
      readVercelOidcToken: () => null,
    }));
    // Stop after the token: this test is about WHICH credential, not about the walk.
    vi.doMock("@features/admin/server/supabase", () => ({
      supabaseFetch: async () => ({ ok: false, status: 500 }),
    }));
    process.env.GOOGLE_WORKSPACE_ADMIN = "admin@example.com";

    const { sheetTabReading } = await import("@/app/api/cron/brain-reconcile/route");
    await expect(sheetTabReading(new Request("https://example.com/"))).resolves.toBeNull();

    expect(serviceAccount).not.toHaveBeenCalled();
    expect(delegated).toHaveBeenCalledWith(
      "admin@example.com",
      "https://www.googleapis.com/auth/drive.readonly",
      expect.any(Number),
      null
    );
    vi.doUnmock("@shared/http/google-oauth");
    vi.doUnmock("@features/admin/server/supabase");
  });
});

/**
 * ONE SHEET THIS ACCOUNT CANNOT READ, NOT THE WHOLE READING. A colleague's personal
 * spreadsheet answering 403 made the reading "could not read" every day from 13 Oct 2026.
 * A 403 or 404 skips that sheet and names it; the others are compared; the reading is
 * unread only when none could be read, and any other failure still fails it.
 */
describe("sheetTabReading with a sheet it cannot read", () => {
  const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/";
  const DOCS: Record<string, { title: string; body: string; tabs: string[] }> = {
    "doc:A": {
      title: "Drive: Budget (part 1 of 2)",
      body: "## Costs\nrows\n## Plan\nrows",
      tabs: ["Costs", "Plan"],
    },
    "doc:B": { title: "Drive: Personal plan", body: "## Rooms\nrows", tabs: ["Rooms"] },
    "doc:C": { title: "Drive: Hiring", body: "## Open\nrows", tabs: ["Open", "Closed"] },
  };

  async function reading(status: Record<string, { meta?: number; values?: number }>) {
    vi.resetModules();
    vi.doMock("@shared/http/google-oauth", () => ({
      DIRECTORY_SCOPE: "directory",
      DRIVE_SCOPE: "drive",
      getDelegatedToken: async () => "delegated-token",
      readVercelOidcToken: () => null,
    }));
    vi.doMock("@features/admin/server/supabase", () => ({
      countRows: async () => 0,
      supabaseFetch: async () =>
        new Response(JSON.stringify(Object.keys(DOCS).map((id) => ({ source_id: id }))), {
          status: 200,
        }),
      fetchAllRows: async (path: string) => {
        const id = decodeURIComponent(/source_id=like\.([^&*]+)\*/.exec(path)![1]!);
        return [{ source_id: id, title: DOCS[id]!.title, body: DOCS[id]!.body }];
      },
    }));
    vi.doMock("@shared/http/fetch-with-timeout", () => ({
      fetchWithTimeout: async (url: string) => {
        const id = `doc:${url.slice(SHEETS.length).split(/[?/]/)[0]}`;
        const doc = DOCS[id]!;
        const isValues = url.includes("/values:batchGet");
        const code = (isValues ? status[id]?.values : status[id]?.meta) ?? 200;
        if (code !== 200) return new Response("{}", { status: code });
        const body = isValues
          ? { valueRanges: doc.tabs.map(() => ({ values: [["x"]] })) }
          : { sheets: doc.tabs.map((title) => ({ properties: { title } })) };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    }));
    process.env.GOOGLE_WORKSPACE_ADMIN = "admin@example.com";
    const { sheetTabReading } = await import("@/app/api/cron/brain-reconcile/route");
    try {
      return await sheetTabReading(new Request("https://example.com/"));
    } finally {
      vi.doUnmock("@shared/http/google-oauth");
      vi.doUnmock("@features/admin/server/supabase");
      vi.doUnmock("@shared/http/fetch-with-timeout");
    }
  }

  it("compares every sheet when all can be read", async () => {
    const r = await reading({});
    expect(r?.what).toBe("spreadsheet tabs present in the corpus (3 of 3 sampled read)");
    // Budget 2 of 2, Personal plan 1 of 1, Hiring 1 of 2.
    expect([r?.left.value, r?.right.value]).toEqual([5, 4]);
  });

  it("skips a sheet that answers 403, names it, and compares the rest", async () => {
    const r = await reading({ "doc:B": { meta: 403 } });
    expect(r?.what).toBe(
      'spreadsheet tabs present in the corpus (2 of 3 sampled read; skipped, not readable by this account: "Personal plan" (403))'
    );
    expect([r?.left.value, r?.right.value]).toEqual([4, 3]);
  });

  it("skips a sheet whose cells answer 404, and names it without its part number", async () => {
    const r = await reading({ "doc:A": { values: 404 } });
    expect(r?.what).toContain('skipped, not readable by this account: "Budget" (404))');
    expect([r?.left.value, r?.right.value]).toEqual([3, 2]);
  });

  it("stays unread when no sheet can be read, naming them", async () => {
    await expect(
      reading({ "doc:A": { meta: 403 }, "doc:B": { meta: 404 }, "doc:C": { values: 403 } })
    ).rejects.toThrow(
      'none of the 3 sampled spreadsheets could be read: "Budget" (403), "Personal plan" (404), "Hiring" (403)'
    );
  });

  it("still fails on anything but a 403 or 404", async () => {
    await expect(reading({ "doc:C": { meta: 400 } })).rejects.toThrow("sheets-meta 400");
  });
});
