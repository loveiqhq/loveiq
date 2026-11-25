import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));

import { addDays } from "@features/admin/server/ap/days";
import {
  CHATGPT_LOOKBACK_DAYS,
  chatgptGap,
  chatgptGapText,
  readChatgptVisits,
  type ChatgptGap,
} from "@features/cron/server/chatgpt-gap";

/**
 * ChatGPT visits per Berlin day in the visit log (`funnel_event`, `unique_visitor`,
 * `utm_source` chatgpt.com), 1 Sep to 24 Nov 2026, read from production on 25 Nov.
 * One line per week from its first day; the first line starts on Tuesday 1 Sep.
 */
const REAL_WEEKS: Array<[string, number[]]> = [
  ["2026-09-01", [0, 2, 3, 2, 1, 1]],
  ["2026-09-07", [0, 1, 1, 2, 4, 3, 0]],
  ["2026-09-14", [0, 2, 1, 0, 0, 1, 0]],
  ["2026-09-21", [1, 1, 0, 0, 1, 0, 0]],
  ["2026-09-28", [2, 1, 2, 3, 2, 2, 3]],
  ["2026-10-05", [1, 3, 0, 0, 0, 0, 0]],
  ["2026-10-12", [0, 0, 0, 2, 2, 4, 0]],
  ["2026-10-19", [3, 0, 0, 1, 1, 1, 1]],
  ["2026-10-26", [3, 1, 1, 5, 0, 1, 3]],
  ["2026-11-02", [2, 1, 8, 2, 1, 2, 0]],
  ["2026-11-09", [3, 1, 1, 0, 0, 2, 0]],
  ["2026-11-16", [4, 0, 1, 0, 1, 0, 0]],
  ["2026-11-23", [2, 1]],
];

/** As the reader returns it: only the days that had a visit. */
const REAL = new Map<string, number>();
for (const [start, counts] of REAL_WEEKS) {
  counts.forEach((n, i) => {
    if (n > 0) REAL.set(addDays(start, i), n);
  });
}

/** `perDay` visits on every day from `from` to `to`: 2 a day is 14 a week. */
function steady(from: string, to: string, perDay = 2): Map<string, number> {
  const counts = new Map<string, number>();
  for (let day = from; day <= to; day = addDays(day, 1)) counts.set(day, perDay);
  return counts;
}

/** The read window production uses on `day`, never before the first day the data covers. */
function windowStart(day: string, dataFrom = "2026-01-01"): string {
  const since = addDays(day, 1 - CHATGPT_LOOKBACK_DAYS);
  return since < dataFrom ? dataFrom : since;
}

/**
 * Every post a stretch of mornings produces: each day judged with production's read window,
 * and each key posted once, as the claim does.
 */
function posts(
  counts: ReadonlyMap<string, number>,
  first: string,
  last: string,
  dataFrom?: string
): Array<[string, ChatgptGap["action"]]> {
  const delivered = new Set<string>();
  const out: Array<[string, ChatgptGap["action"]]> = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const gap = chatgptGap(counts, day, windowStart(day, dataFrom));
    if (gap.action && gap.key && !delivered.has(gap.key)) {
      delivered.add(gap.key);
      out.push([day, gap.action]);
    }
  }
  return out;
}

describe("chatgptGap", () => {
  it("on the real numbers since 1 Sep posts twice: after 7 to 10 Oct, and when ChatGPT came back on 15 Oct", () => {
    // The fixture starts on 1 Sep, so the window never reaches back into August.
    expect(posts(REAL, "2026-09-01", "2026-11-24", "2026-09-01")).toEqual([
      ["2026-10-10", "alert"],
      ["2026-10-15", "back"],
    ]);
  });

  it("needs the quiet days that would come by chance less than 1 time in 100", () => {
    // 9 Sep to 6 Oct held 36 visits (9 a week): 3 quiet days happen by chance 2 times in
    // 100 at that rate, 4 quiet days under 1 time in 100.
    expect(chatgptGap(REAL, "2026-10-09", "2026-09-01")).toMatchObject({
      streak: 3,
      usualPerWeek: 9,
      needed: 4,
      action: null,
    });
    expect(chatgptGap(REAL, "2026-10-10", "2026-09-01")).toMatchObject({
      streak: 4,
      needed: 4,
      action: "alert",
      key: "2026-10-07:alert",
    });
  });

  it("waits for more quiet days when ChatGPT usually sends fewer visits, never fewer than 3", () => {
    const firstPost = (counts: Map<string, number>) => posts(counts, "2026-10-25", "2026-11-30")[0];
    // 28 a week: chance alone would allow 2 days, the floor keeps 3. 14 a week: 3. 7 a week: 5.
    expect(firstPost(steady("2026-09-27", "2026-10-24", 4))).toEqual(["2026-10-27", "alert"]);
    expect(firstPost(steady("2026-09-27", "2026-10-24", 2))).toEqual(["2026-10-27", "alert"]);
    expect(firstPost(steady("2026-09-27", "2026-10-24", 1))).toEqual(["2026-10-29", "alert"]);
    // One visit every other day (3 or 4 a week): 10 days.
    const everyOther = new Map<string, number>();
    for (let day = "2026-09-28"; day <= "2026-10-24"; day = addDays(day, 2)) everyOther.set(day, 1);
    expect(firstPost(everyOther)).toEqual(["2026-11-03", "alert"]);
  });

  it("posts a missed alert the next morning: the quiet run keeps its key", () => {
    const counts = steady("2026-10-01", "2026-11-21");
    expect(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24"))).toMatchObject({
      action: "alert",
      key: "2026-11-22:alert",
    });
    expect(chatgptGap(counts, "2026-11-25", windowStart("2026-11-25"))).toMatchObject({
      action: "alert",
      key: "2026-11-22:alert",
    });
  });

  it("reminds once a week for 8 weeks, then stops until the visits come back", () => {
    const counts = steady("2026-09-01", "2026-10-31");
    expect(posts(counts, "2026-11-01", "2027-01-31")).toEqual([
      ["2026-11-03", "alert"],
      ["2026-11-10", "reminder"],
      ["2026-11-17", "reminder"],
      ["2026-11-24", "reminder"],
      ["2026-12-01", "reminder"],
      ["2026-12-08", "reminder"],
      ["2026-12-15", "reminder"],
      ["2026-12-22", "reminder"],
      ["2026-12-29", "reminder"],
    ]);
    expect(chatgptGap(counts, "2026-12-29", windowStart("2026-12-29"))).toMatchObject({
      last: true,
      usualPerWeek: 14,
    });
  });

  it("posts a comeback after enough quiet days, and catches it up while the visits go on, for a week", () => {
    const counts = steady("2026-10-01", "2026-11-19");
    for (const [day, n] of steady("2026-11-25", "2026-12-10")) counts.set(day, n);
    // 20 to 24 Nov quiet at 14 a week (3 needed), visits again from 25 Nov.
    expect(chatgptGap(counts, "2026-11-25", windowStart("2026-11-25"))).toMatchObject({
      visits: 2,
      action: "back",
      key: "2026-11-25:back",
      run: { from: "2026-11-20", days: 5, capped: false },
    });
    expect(chatgptGap(counts, "2026-11-26", windowStart("2026-11-26"))).toMatchObject({
      action: "back",
      key: "2026-11-25:back",
    });
    expect(chatgptGap(counts, "2026-12-02", windowStart("2026-12-02")).action).toBeNull();
  });

  it("does not call quiet days a comeback when they were too few to post about", () => {
    const counts = steady("2026-10-01", "2026-11-20");
    counts.set("2026-11-23", 2);
    // 21 and 22 Nov quiet: 2 days.
    expect(chatgptGap(counts, "2026-11-23", windowStart("2026-11-23"))).toMatchObject({
      streak: 0,
      action: null,
    });
  });

  it("counts a day missing from the log as a day without visits, back to the first day read", () => {
    expect(chatgptGap(new Map(), "2026-11-24", "2026-11-20")).toMatchObject({
      streak: 5,
      action: null,
    });
  });

  it("counts across the end of summer time (25 Oct) like any other night", () => {
    const counts = steady("2026-09-26", "2026-10-23");
    expect(chatgptGap(counts, "2026-10-26", windowStart("2026-10-26"))).toMatchObject({
      streak: 3,
      action: "alert",
    });
  });
});

describe("chatgptGapText", () => {
  it("names the quiet days, the usual week and the October gap when it posts", () => {
    const counts = steady("2026-10-25", "2026-11-21");
    const text = chatgptGapText(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24")))!;
    expect(text.headline).toContain("3 days");
    expect(text.headline).toContain("22 to 24 Nov");
    expect(text.body).toContain("14 a week");
    expect(text.body).toContain("7 to 14 Oct 2026");
  });

  it("writes quiet days across two months with both months", () => {
    const counts = steady("2026-11-01", "2026-11-29");
    const text = chatgptGapText(chatgptGap(counts, "2026-12-02", windowStart("2026-12-02")))!;
    expect(text.headline).toContain("30 Nov to 2 Dec");
  });

  it("says how long the quiet has lasted in a reminder", () => {
    const counts = steady("2026-10-18", "2026-11-14");
    const text = chatgptGapText(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24")))!;
    expect(text.headline).toContain("10 days");
    expect(text.headline).toContain("15 to 24 Nov");
  });

  it("says when a reminder is the last one", () => {
    const counts = steady("2026-09-01", "2026-10-31");
    const text = chatgptGapText(chatgptGap(counts, "2026-12-29", windowStart("2026-12-29")))!;
    expect(text.body).toContain("last reminder");
  });

  it("says how many came back, from which day, and after how many quiet days", () => {
    const counts = steady("2026-10-01", "2026-11-19");
    counts.set("2026-11-25", 2);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-25", windowStart("2026-11-25")))!;
    expect(text.headline).toContain("2 on 25 Nov");
    expect(text.headline).toContain("5 days");
  });

  it("counts every visit since the first day back when it catches up", () => {
    const counts = steady("2026-10-01", "2026-11-19");
    counts.set("2026-11-25", 2);
    counts.set("2026-11-26", 3);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-26", windowStart("2026-11-26")))!;
    expect(text.headline).toContain("5 since 25 Nov");
  });

  it("says more than 12 weeks when the quiet began before the days it reads", () => {
    const counts = steady("2026-07-01", "2026-08-31");
    counts.set("2026-12-01", 1);
    const text = chatgptGapText(chatgptGap(counts, "2026-12-01", windowStart("2026-12-01")))!;
    expect(text.headline).toContain("more than 12 weeks");
  });

  it("has nothing to say on an ordinary day", () => {
    expect(
      chatgptGapText(chatgptGap(REAL, "2026-11-24", windowStart("2026-11-24", "2026-09-01")))
    ).toBeNull();
  });
});

describe("readChatgptVisits", () => {
  beforeEach(() => mockFetchAllRows.mockReset());

  it("reads every page of ChatGPT's tagged visits in the window and counts them per day", async () => {
    mockFetchAllRows.mockResolvedValue([
      { day: "2026-11-24" },
      { day: "2026-11-24" },
      { day: "2026-11-22" },
    ]);
    const counts = await readChatgptVisits("2026-08-27", "2026-11-24");
    expect([...counts]).toEqual([
      ["2026-11-24", 2],
      ["2026-11-22", 1],
    ]);
    const path = decodeURIComponent(String(mockFetchAllRows.mock.calls[0]![0]));
    expect(path).toContain("/rest/v1/funnel_event?");
    expect(path).toContain("event_type=eq.unique_visitor");
    expect(path).toContain('utm_source=in.("chatgpt.com","chatgpt","chat.openai.com")');
    expect(path).toContain("day=gte.2026-08-27");
    expect(path).toContain("day=lte.2026-11-24");
    expect(path).toContain("order=day.desc,visitor_id.asc");
  });

  it("throws when a page fails, so an outage never reads as a quiet day", async () => {
    mockFetchAllRows.mockResolvedValue(null);
    await expect(readChatgptVisits("2026-08-27", "2026-11-24")).rejects.toThrow("visit log");
  });
});
