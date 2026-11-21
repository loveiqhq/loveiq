import { beforeEach, describe, expect, it, vi } from "vitest";

/** This browser's cookies (the under-18 mark lives here). */
const jar = { get: vi.fn(), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@features/mira/server/store", () => ({
  logMiraEvent: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  deleteChats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { journalContext } from "@features/mira/server/journal";
import { stopForMinor } from "@features/mira/server/minor";
import { personalInstructions } from "@features/mira/server/prompt";

const UID = "11111111-2222-4333-8444-555555555555";
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const calls = () =>
  vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
    method: init?.method ?? "GET",
    path,
    body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
  }));

let rows: { user: unknown[]; entries: unknown[] };
beforeEach(() => {
  vi.clearAllMocks();
  rows = { user: [], entries: [] };
  vi.mocked(supabaseFetch).mockImplementation(async (path: string) =>
    json(path.startsWith("/rest/v1/mira_user") ? rows.user : rows.entries)
  );
});

describe("someone Mira stops as under 18", () => {
  it("loses their whole journal, Mira's reading of it and its reminder", async () => {
    await stopForMinor(UID);
    const theirs = calls().filter((c) => c.method !== "GET");
    expect(theirs).toContainEqual({
      method: "DELETE",
      path: `/rest/v1/mira_journal_entry?user_id=eq.${UID}`,
      body: null,
    });
    expect(theirs).toContainEqual({
      method: "PATCH",
      path: `/rest/v1/mira_user?id=eq.${UID}`,
      body: expect.objectContaining({ journal_share: "off", journal_reminder_time: null }),
    });
  });
});

describe("what Mira reads of the journal in a chat", () => {
  const NOW = new Date("2026-11-21T19:00:00Z");
  const entries = [{ day: "2026-11-21", mood: 3, body: 2, closeness: null, energy: 4 }];

  it("is nothing, and no entry is read, while the person hasn't allowed it", async () => {
    rows.user = [{ journal_share: "off", time_zone: "Europe/Berlin" }];
    expect(await journalContext(UID, NOW)).toBeNull();
    expect(calls().map((c) => c.path)).toEqual([
      `/rest/v1/mira_user?id=eq.${UID}&select=journal_share,time_zone&limit=1`,
    ]);
  });

  it("is the person's own last 7 days, and the notes are not even read without the second choice", async () => {
    rows.user = [{ journal_share: "scores", time_zone: "Europe/Berlin" }];
    rows.entries = entries;
    const block = await journalContext(UID, NOW);
    expect(block).toContain("- Sat 21 Nov: mood 3, body 2, energy 4.");
    const read = calls()[1]!.path;
    expect(read).toBe(
      `/rest/v1/mira_journal_entry?user_id=eq.${UID}&day=gte.2026-11-15&day=lte.2026-11-21&select=day,mood,body,closeness,energy&order=day.asc`
    );
  });

  it("goes into her instructions for that person, after what they told her", () => {
    const text = personalInstructions({}, { signedIn: true, journal: "THEIR DAILY JOURNAL\n- x" });
    expect(text.split("\n").slice(-2)).toEqual(["THEIR DAILY JOURNAL", "- x"]);
    expect(personalInstructions({}, { signedIn: true })).not.toContain("JOURNAL");
  });
});
