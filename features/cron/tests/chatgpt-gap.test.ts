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
  it("on the real numbers since 1 Sep posts twice: after 7 to 11 Oct, and once ChatGPT was back on 15 and 16 Oct", () => {
    // The fixture starts on 1 Sep, so the window never reaches back into August.
    expect(posts(REAL, "2026-09-01", "2026-11-24", "2026-09-01")).toEqual([
      ["2026-10-11", "alert"],
      ["2026-10-16", "back"],
    ]);
  });

  it("needs the quiet days that would come by chance less than 3 times in 1,000", () => {
    // 9 Sep to 6 Oct held 36 visits (9 a week): 4 quiet days happen by chance 6 times in
    // 1,000 at that rate, 5 quiet days under 2 in 1,000.
    expect(chatgptGap(REAL, "2026-10-10", "2026-09-01")).toMatchObject({
      streak: 4,
      usualPerWeek: 9,
      needed: 5,
      action: null,
    });
    expect(chatgptGap(REAL, "2026-10-11", "2026-09-01")).toMatchObject({
      streak: 5,
      needed: 5,
      action: "alert",
      key: "2026-10-07:alert",
    });
    // 31 visits in the 4 weeks before (8 a week): 5 quiet days come by chance 4 times in
    // 1,000, so it takes 6.
    const counts = steady("2026-10-25", "2026-11-21", 1);
    for (const day of ["2026-11-01", "2026-11-08", "2026-11-15"]) counts.set(day, 2);
    expect(chatgptGap(counts, "2026-11-26", windowStart("2026-11-26"))).toMatchObject({
      usualPerWeek: 8,
      needed: 6,
      action: null,
    });
    expect(chatgptGap(counts, "2026-11-27", windowStart("2026-11-27")).action).toBe("alert");
  });

  it("waits for more quiet days when ChatGPT usually sends fewer visits, never fewer than 3", () => {
    const firstPost = (counts: Map<string, number>) => posts(counts, "2026-10-25", "2026-11-30")[0];
    // 28 a week: chance alone would allow 2 days, the floor keeps 3. 14 a week: 3. 7 a week: 6.
    expect(firstPost(steady("2026-09-27", "2026-10-24", 4))).toEqual(["2026-10-27", "alert"]);
    expect(firstPost(steady("2026-09-27", "2026-10-24", 2))).toEqual(["2026-10-27", "alert"]);
    expect(firstPost(steady("2026-09-27", "2026-10-24", 1))).toEqual(["2026-10-30", "alert"]);
    // One visit every other day (3 or 4 a week): 12 days.
    const everyOther = new Map<string, number>();
    for (let day = "2026-09-28"; day <= "2026-10-24"; day = addDays(day, 2)) everyOther.set(day, 1);
    expect(firstPost(everyOther)).toEqual(["2026-11-05", "alert"]);
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

  it("posts a comeback once tagged visits came on two days, and catches it up for a week", () => {
    const counts = steady("2026-10-01", "2026-11-19");
    for (const [day, n] of steady("2026-11-25", "2026-12-10")) counts.set(day, n);
    // 20 to 24 Nov quiet at 14 a week (3 needed). 25 Nov alone is not back yet (the alert's
    // own key, posted already); 26 Nov, the second day with visits, is.
    expect(chatgptGap(counts, "2026-11-25", windowStart("2026-11-25"))).toMatchObject({
      visits: 2,
      action: "alert",
      key: "2026-11-20:alert",
    });
    expect(chatgptGap(counts, "2026-11-26", windowStart("2026-11-26"))).toMatchObject({
      action: "back",
      key: "2026-11-26:back",
      run: { from: "2026-11-20", days: 5, capped: false },
      back: { days: ["2026-11-25", "2026-11-26"], visits: 4 },
    });
    // Caught up for 7 days from the day that ended the run: to 2 Dec, not 3 Dec.
    expect(chatgptGap(counts, "2026-12-02", windowStart("2026-12-02"))).toMatchObject({
      action: "back",
      key: "2026-11-26:back",
    });
    expect(chatgptGap(counts, "2026-12-03", windowStart("2026-12-03")).action).toBeNull();
  });

  it("does not let lone stray days end a quiet run it posted about: same key, same usual rate", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-06", 1); // a bookmarked link, say
    // Quiet from 1 Nov at 14 a week, posted on 3 Nov. 6 Nov's visit is not a comeback.
    expect(chatgptGap(counts, "2026-11-06", windowStart("2026-11-06"))).toMatchObject({
      action: "alert",
      key: "2026-11-01:alert",
      run: { from: "2026-11-01", visitDays: ["2026-11-06"] },
    });
    expect(chatgptGap(counts, "2026-11-10", windowStart("2026-11-10"))).toMatchObject({
      action: "reminder",
      key: "2026-11-01:week1",
      usualPerWeek: 14,
      needed: 3,
      run: { from: "2026-11-01", days: 10 },
    });
    // A second stray two weeks later is a stray too: the reminders go on.
    counts.set("2026-11-20", 2);
    expect(chatgptGap(counts, "2026-11-20", windowStart("2026-11-20"))).toMatchObject({
      action: "reminder",
      key: "2026-11-01:week2",
      run: { from: "2026-11-01", days: 20, visitDays: ["2026-11-06", "2026-11-20"] },
    });
    // Visits again less than a week later end it, still against the rate from before the quiet.
    counts.set("2026-11-24", 1);
    expect(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24"))).toMatchObject({
      action: "back",
      key: "2026-11-24:back",
      usualPerWeek: 14,
      run: { from: "2026-11-01" },
      back: { days: ["2026-11-20", "2026-11-24"], visits: 3 },
    });
  });

  it("ends a quiet run on visits 6 days apart, not 7", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-06", 1);
    const sixApart = new Map(counts).set("2026-11-12", 1);
    expect(chatgptGap(sixApart, "2026-11-12", windowStart("2026-11-12"))).toMatchObject({
      action: "back",
      back: { days: ["2026-11-06", "2026-11-12"] },
    });
    const sevenApart = new Map(counts).set("2026-11-13", 1);
    expect(chatgptGap(sevenApart, "2026-11-13", windowStart("2026-11-13"))).toMatchObject({
      action: "reminder",
      key: "2026-11-01:week1",
      run: { visitDays: ["2026-11-06", "2026-11-13"] },
    });
  });

  it("takes a run's usual rate from its 28 days before even when they lie before the first day judged", () => {
    // One visit every 4 days up to 2 Nov (1.75 a week: 24 quiet days needed), then none.
    const counts = new Map<string, number>();
    for (let d = "2026-11-02"; d >= "2026-09-01"; d = addDays(d, -4)) counts.set(d, 1);
    // Judged from 1 Nov, the run from 3 Nov has only 2 of its usual days inside the days
    // judged; read from the 28 before them, it keeps its rate and needs 24 quiet days.
    expect(chatgptGap(counts, "2026-11-30", "2026-11-01")).toMatchObject({
      action: "alert",
      key: "2026-11-03:alert",
      needed: 24,
      usualPerWeek: 2,
      run: { from: "2026-11-03", days: 28, capped: false },
    });
  });

  it("stays quiet after its last reminder while the outage goes on, whatever trickles in", () => {
    const counts = new Map(REAL);
    counts.set("2026-12-05", 1);
    counts.set("2026-12-30", 1);
    // Once 25 Nov leaves the days read, a run measured on the outage's own trickle would need
    // 82 quiet days: past 28, so it never posts a second "first" alert in March.
    expect(posts(counts, "2026-11-25", "2027-04-30")).toEqual([
      ["2026-11-28", "alert"],
      ["2026-12-05", "reminder"],
      ["2026-12-12", "reminder"],
      ["2026-12-19", "reminder"],
      ["2026-12-26", "reminder"],
      ["2027-01-02", "reminder"],
      ["2027-01-09", "reminder"],
      ["2027-01-16", "reminder"],
      ["2027-01-23", "reminder"],
    ]);
  });

  it("never posts about a run that began before the days it reads, even at the edge of its reminders", () => {
    // 7 visits in the 28 days before 1 Sep (24 quiet days needed), then none. On 3 Dec the
    // days read start on 5 Sep; that capped run's own 28 days hold 6 visits, so it needs 28
    // and would be in its eighth reminder week. It says nothing instead.
    const counts = new Map<string, number>();
    for (let d = "2026-08-31"; d >= "2026-08-07"; d = addDays(d, -4)) counts.set(d, 1);
    expect(chatgptGap(counts, "2026-12-03", windowStart("2026-12-03"))).toMatchObject({
      action: null,
      run: { from: "2026-09-05", capped: true },
    });
  });

  it("keeps reminding for 8 weeks through stray days that come a week or more apart", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    for (const day of ["2026-11-06", "2026-11-16", "2026-11-26", "2026-12-06", "2026-12-16"])
      counts.set(day, 1);
    expect(posts(counts, "2026-11-01", "2027-01-10")).toEqual([
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
  });

  it("still ends a quiet run too short to post about on its first day with visits", () => {
    const counts = steady("2026-10-01", "2026-11-20");
    counts.set("2026-11-23", 1);
    // 21 and 22 Nov quiet (3 needed), a visit, 24 and 25 Nov quiet: two short runs, no post.
    expect(chatgptGap(counts, "2026-11-25", windowStart("2026-11-25"))).toMatchObject({
      streak: 2,
      action: null,
      run: { from: "2026-11-24", days: 2 },
    });
  });

  it("posts the comeback for a quiet run just long enough to have been posted about", () => {
    const counts = steady("2026-10-01", "2026-11-21");
    counts.set("2026-11-25", 2);
    counts.set("2026-11-26", 1);
    // 22 to 24 Nov quiet: 3 days, exactly the 3 needed at 14 a week.
    expect(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24")).action).toBe("alert");
    expect(chatgptGap(counts, "2026-11-26", windowStart("2026-11-26"))).toMatchObject({
      action: "back",
      run: { from: "2026-11-22", days: 3 },
    });
  });

  it("takes the usual rate from the 28 days before the first quiet day, not counting it", () => {
    // 56 visits from 25 Oct to 21 Nov: 2 a day, so 3 quiet days are enough. Counting the first
    // quiet day as well would make it 1.93 a day, and 4.
    const counts = steady("2026-10-25", "2026-11-21");
    expect(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24"))).toMatchObject({
      usualPerWeek: 14,
      needed: 3,
      action: "alert",
    });
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

  it("says only what the visit log can see: tagged visits, the rest count as Direct", () => {
    const counts = steady("2026-10-25", "2026-11-21");
    const alert = chatgptGapText(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24")))!;
    expect(alert.headline).toContain("no tagged visits");
    expect(alert.body).toContain("counted as Direct");
    const reminder = chatgptGapText(chatgptGap(counts, "2026-12-01", windowStart("2026-12-01")))!;
    expect(reminder.headline).toContain("still no tagged visits");
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

  it("says when one day of a quiet run had tagged visits", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-06", 1);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-10", windowStart("2026-11-10")))!;
    expect(text.headline).toBe("ChatGPT: still almost no tagged visits, 10 days now (1 to 10 Nov)");
    expect(text.body).toContain("Tagged visits on one day only (6 Nov).");
  });

  it("counts the quiet days in an alert that already has a stray day", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-05", 1);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-06", windowStart("2026-11-06")))!;
    expect(text.headline).toBe("ChatGPT sent almost no tagged visits for 6 days (1 to 6 Nov)");
    expect(text.body).toContain("Tagged visits on one day only (5 Nov).");
  });

  it("names every stray day of a quiet run", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-06", 1);
    counts.set("2026-11-20", 2);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-22", windowStart("2026-11-22")))!;
    expect(text.headline).toBe("ChatGPT: still almost no tagged visits, 22 days now (1 to 22 Nov)");
    expect(text.body).toContain("Tagged visits on 2 days only (6 Nov, 20 Nov).");
  });

  it("says a comeback came after almost none when the quiet had a stray day", () => {
    const counts = steady("2026-10-01", "2026-10-31");
    counts.set("2026-11-06", 1);
    counts.set("2026-11-20", 2);
    counts.set("2026-11-24", 1);
    const text = chatgptGapText(chatgptGap(counts, "2026-11-24", windowStart("2026-11-24")))!;
    expect(text.headline).toBe(
      "ChatGPT visits are back: 3 on 20 Nov and 24 Nov, after almost none since 31 Oct"
    );
    expect(text.body).toBe("In between, tagged visits on one day only (6 Nov).");
  });

  it("says how many came back on the two days that ended the quiet, and since when it was quiet", () => {
    const counts = steady("2026-10-01", "2026-11-19");
    counts.set("2026-11-25", 2);
    counts.set("2026-11-26", 3);
    const back = (day: string) => chatgptGapText(chatgptGap(counts, day, windowStart(day)))!;
    expect(back("2026-11-26").headline).toBe(
      "ChatGPT visits are back: 5 on 25 Nov and 26 Nov, the first since 19 Nov"
    );
    // Caught up two days later, it says the same.
    expect(back("2026-11-28").headline).toBe(back("2026-11-26").headline);
  });

  it("says more than 12 weeks when the quiet began before the days it reads", () => {
    const counts = steady("2026-07-01", "2026-08-31");
    counts.set("2026-12-01", 1);
    counts.set("2026-12-02", 1);
    const text = chatgptGapText(chatgptGap(counts, "2026-12-02", windowStart("2026-12-02")))!;
    expect(text.headline).toContain("the first in more than 12 weeks");
    // Its first day moves with the days read, so the post is claimed by the day that ended it.
    expect(posts(counts, "2026-12-02", "2026-12-10")).toEqual([["2026-12-02", "back"]]);
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
