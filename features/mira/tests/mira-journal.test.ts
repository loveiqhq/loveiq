import { describe, expect, it } from "vitest";
import {
  canStart,
  forMira,
  patterns,
  streak,
  week,
  type JournalEntry,
} from "@features/mira/journal";

const entry = (day: string, rated: Partial<JournalEntry> = {}): JournalEntry => ({
  day,
  mood: null,
  body: null,
  closeness: null,
  energy: null,
  note: null,
  ...rated,
});

describe("the weekly patterns", () => {
  // Today is Saturday 21 Nov: the last 7 days are the 15th to the 21st, the 7 before the 8th to the 14th.
  const entries = [
    entry("2026-11-08", { mood: 2 }),
    entry("2026-11-09", { closeness: 2 }),
    entry("2026-11-10", { mood: 3, closeness: 3 }),
    entry("2026-11-11", { closeness: 2 }),
    entry("2026-11-12", { mood: 3 }),
    entry("2026-11-15", { mood: 3, closeness: 2 }),
    entry("2026-11-16", { mood: 4, closeness: 2 }),
    entry("2026-11-17", { closeness: 2 }),
    entry("2026-11-18", { mood: 4 }),
    entry("2026-11-20", { mood: 3 }),
    entry("2026-11-21", { energy: 5 }),
  ];
  const byArea = Object.fromEntries(patterns(entries, "2026-11-21").map((p) => [p.id, p]));

  it("say each area's average over the last 7 days, and how it compares with the 7 before", () => {
    expect(byArea.mood).toMatchObject({ label: "Mood", avg: 3.5, n: 4 });
    expect(byArea.mood!.summary).toBe(
      "3.5 out of 5 on average over the last 7 days (4 check-ins), higher than the 7 days before (2.7)."
    );
    expect(byArea.closeness!.summary).toBe(
      "2.0 out of 5 on average over the last 7 days (3 check-ins), lower than the 7 days before (2.3)."
    );
  });

  it("compare only when both weeks have three ratings or more, and say plainly when there are none", () => {
    expect(byArea.energy!.summary).toBe(
      "5.0 out of 5 on average over the last 7 days (1 check-in)."
    );
    expect(byArea.body).toMatchObject({
      avg: null,
      n: 0,
      summary: "No rating in the last 7 days.",
    });
  });

  it("call a change under 0.3 points about the same", () => {
    // 3.25 against 3.0.
    const flat = [
      ...["08", "09", "10"].map((d) => entry(`2026-11-${d}`, { body: 3 })),
      ...["15", "16", "17", "18"].map((d, i) => entry(`2026-11-${d}`, { body: i ? 3 : 4 })),
    ];
    expect(patterns(flat, "2026-11-21").find((p) => p.id === "body")!.summary).toBe(
      "3.3 out of 5 on average over the last 7 days (4 check-ins), about the same as the 7 days before."
    );
  });

  it("chart the last 28 days, oldest first, with a gap where there is no rating", () => {
    expect(byArea.mood!.days).toHaveLength(28);
    expect(byArea.mood!.days.slice(-7)).toEqual([3, 4, null, 4, null, 3, null]);
    expect(byArea.mood!.days[0]).toBeNull(); // 24 Oct
  });
});

describe("the day a new check-in may be for", () => {
  it("is yesterday or today in their zone, or a day already begun somewhere (a traveller)", () => {
    // 23:30 UTC on the 21st: 00:30 on the 22nd in Berlin.
    const late = new Date("2026-11-21T23:30:00Z");
    expect(
      ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((d) =>
        canStart(d, late, "Europe/Berlin")
      )
    ).toEqual([false, true, true, false]);
    // 14:00 on the 24th in Berlin: yesterday still takes a new check-in (one started before
    // midnight), the day before that doesn't; Kiribati is already on the 25th.
    const afternoon = new Date("2026-11-24T13:00:00Z");
    expect(
      ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"].map((d) =>
        canStart(d, afternoon, "Europe/Berlin")
      )
    ).toEqual([false, true, true, true]);
  });

  it("never a day older than yesterday in their zone, though it is today somewhere", () => {
    // 11:30 UTC on the 24th: 00:30 on the 25th in Auckland, the 23rd still in Baker Island.
    const now = new Date("2026-11-24T11:30:00Z");
    expect(canStart("2026-11-23", now, "Pacific/Auckland")).toBe(false);
    expect(canStart("2026-11-24", now, "Pacific/Auckland")).toBe(true);
  });
});

describe("the week dots", () => {
  it("show the seven days ending today, oldest first, each as done, open or without a check-in", () => {
    // Saturday 21 Nov 2026; nothing on Sunday the 15th or Tuesday the 17th.
    const days = ["2026-11-16", "2026-11-18", "2026-11-19", "2026-11-20"];
    expect(week(days, "2026-11-21")).toEqual([
      { day: "2026-11-15", label: "Sun", name: "Sunday", state: "none" },
      { day: "2026-11-16", label: "Mon", name: "Monday", state: "done" },
      { day: "2026-11-17", label: "Tue", name: "Tuesday", state: "none" },
      { day: "2026-11-18", label: "Wed", name: "Wednesday", state: "done" },
      { day: "2026-11-19", label: "Thu", name: "Thursday", state: "done" },
      { day: "2026-11-20", label: "Fri", name: "Friday", state: "done" },
      { day: "2026-11-21", label: "Today", name: "Today", state: "open" },
    ]);
  });

  it("fill today once it is done", () => {
    expect(week(["2026-11-21"], "2026-11-21").at(-1)).toMatchObject({ state: "today" });
  });
});

describe("the streak", () => {
  it("counts the days in a row up to today", () => {
    expect(streak(["2026-11-19", "2026-11-20", "2026-11-21"], "2026-11-21")).toBe(3);
  });

  it("still counts up to yesterday while today is open, so an evening check-in never breaks it", () => {
    expect(streak(["2026-11-18", "2026-11-19", "2026-11-20"], "2026-11-21")).toBe(3);
  });

  it("starts again after a day without a check-in", () => {
    expect(streak(["2026-11-17", "2026-11-18", "2026-11-20", "2026-11-21"], "2026-11-21")).toBe(2);
    expect(streak(["2026-11-17", "2026-11-18", "2026-11-19"], "2026-11-21")).toBe(0);
    expect(streak([], "2026-11-21")).toBe(0);
  });

  it("runs across a month's end and ignores order and repeats", () => {
    expect(streak(["2026-12-01", "2026-11-30", "2026-11-29", "2026-11-30"], "2026-12-01")).toBe(3);
  });
});

describe("what Mira reads of the journal", () => {
  const entries = [
    entry("2026-11-14", { mood: 1, note: "Too long ago" }),
    entry("2026-11-20", { mood: 4 }),
    entry("2026-11-21", {
      mood: 3,
      body: 2,
      closeness: 4,
      energy: 3,
      note: 'Felt "okay" after the walk',
    }),
  ];

  it("is nothing unless the person let her read it", () => {
    expect(forMira(entries, "off", "2026-11-21")).toBeNull();
  });

  it("is the last 7 days' ratings, oldest first, without the notes", () => {
    const block = forMira(entries, "scores", "2026-11-21")!;
    expect(block.split("\n").slice(-2)).toEqual([
      "- Fri 20 Nov: mood 4.",
      "- Sat 21 Nov: mood 3, body 2, closeness 4, energy 3.",
    ]);
    expect(block).toMatch(/^THEIR DAILY JOURNAL\n/);
    expect(block).not.toContain("Felt");
    expect(block).not.toContain("Too long ago");
  });

  it("adds the notes only when the person also allowed those", () => {
    expect(forMira(entries, "notes", "2026-11-21")!.split("\n").at(-1)).toBe(
      '- Sat 21 Nov: mood 3, body 2, closeness 4, energy 3. Their note: "Felt \\"okay\\" after the walk"'
    );
  });

  it("is nothing when there is no check-in in the last 7 days", () => {
    expect(forMira([entry("2026-11-14", { mood: 2 })], "notes", "2026-11-21")).toBeNull();
  });
});
