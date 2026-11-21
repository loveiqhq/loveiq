import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildMiraPage, type MiraData } from "@features/admin/server/ap/mira";
import { fetchJournal, journalFigures } from "@features/admin/server/ap/mira-journal";

const TODAY = "2026-11-20";
const account = (id: string, email = `${id}@example.com`, over: Record<string, unknown> = {}) => ({
  id,
  email,
  created_at: "2026-10-01T09:00:00Z",
  style: {},
  use_assessment: false,
  ...over,
});
const days = (user_id: string, ...list: string[]) => list.map((day) => ({ user_id, day }));

beforeEach(() => vi.clearAllMocks());

describe("the journal's KPI card", () => {
  // The range is 2 to 15 Nov 2026.
  const entries = [
    // A: first on the 2nd, three in a row, back on day 7 (the 9th).
    ...days("a", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-09"),
    // B: first on the 3rd, last on the 8th: day 7 is the 10th, never back.
    ...days("b", "2026-11-03", "2026-11-08"),
    // C: first on the 10th: day 7 (the 17th) is after the range, so not counted for D7.
    ...days("c", "2026-11-10", "2026-11-11"),
    // D: started before the range, so not in its D7 group; one check-in in the range.
    ...days("d", "2026-10-30", "2026-11-14"),
    // The team's: an account with a team address, never counted.
    ...days("s", "2026-11-05", "2026-11-06"),
  ];
  const settings = [
    { id: "a", journal_share: "notes", journal_reminder_time: "20:00" },
    { id: "b", journal_share: "scores", journal_reminder_time: null },
    { id: "c", journal_share: "off", journal_reminder_time: "07:30" },
    { id: "s", journal_share: "notes", journal_reminder_time: "20:00" },
  ];
  const accounts = new Set(["a", "b", "c", "d", "e"]);
  const fig = journalFigures({ entries, settings }, accounts, "2026-11-02", "2026-11-15");

  it("counts the people who checked in in the range, and their check-ins", () => {
    expect(fig).toMatchObject({ read: true, accounts: 5, journalers: 4, checkIns: 9 });
  });

  it("reads D7 retention as coming back on day 7 or later, of those who started in the range in time", () => {
    expect(fig.d7).toEqual({ returned: 1, of: 2 });
  });

  it("averages each person's longest run of days in a row in the range", () => {
    // A 3, B 1, C 2, D 1.
    expect(fig.avgStreak).toBe(1.75);
  });

  it("reads the reminder and Mira's reading as today's settings, of today's accounts", () => {
    expect(fig).toMatchObject({ reminders: 2, sharing: 2, notes: 1 });
  });

  it("says when the journal could not be read, and counts nothing", () => {
    expect(journalFigures(null, accounts, "2026-11-02", "2026-11-15")).toMatchObject({
      read: false,
      journalers: 0,
      avgStreak: null,
    });
  });

  it("is on the Mira page, the team left out by its address", () => {
    const data = {
      users: [...accounts].map((id) => account(id)).concat(account("s", "eman@loveiq.org")),
      events: [],
      nudges: [],
      bodyChecks: [],
      withResult: new Set<string>(),
      journal: { entries, settings },
    } satisfies MiraData;
    const page = buildMiraPage({
      data,
      filters: parseFilters({ period: "custom", from: "2026-11-02", to: "2026-11-15" }, TODAY),
      today: TODAY,
      now: new Date(`${TODAY}T12:00:00Z`),
    });
    expect(page.journal).toEqual(fig);
  });
});

describe("reading the journal for the card", () => {
  it("asks for days and settings only, never ratings or notes", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    await fetchJournal();
    const paths = mockFetchAllRows.mock.calls.map(([p]) => String(p));
    expect(paths).toEqual([
      "/rest/v1/mira_journal_entry?select=user_id,day&order=id.asc",
      "/rest/v1/mira_user?or=(journal_share.neq.off,journal_reminder_time.not.is.null)&select=id,journal_share,journal_reminder_time&order=id.asc",
    ]);
    expect(paths.join()).not.toMatch(/mood|body|closeness|energy|note/);
  });

  it("answers null rather than half the rows", async () => {
    mockFetchAllRows.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    expect(await fetchJournal()).toBeNull();
  });
});
