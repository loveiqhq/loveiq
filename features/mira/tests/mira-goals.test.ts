import { describe, expect, it } from "vitest";
import { isTickableDay, localDay, progress, weekStart } from "@features/mira/server/goal-progress";
import { CRISIS_TOKEN, parseReply } from "@features/mira/server/safety";

/** Challenges & goals: the logic under the API and the screens (routes and UI have their own). */

describe("Mira's goal suggestion ([[GOAL:…]])", () => {
  it("reads the goal in Mira's words and keeps it off the screen", () => {
    const out = parseReply(
      "Leaving one soft light on could be a gentle start.\n[[GOAL:Leave one soft light on for the first minute]]"
    );
    expect(out.goal).toBe("Leave one soft light on for the first minute");
    expect(out.text).toBe("Leaving one soft light on could be a gentle start.");
  });

  it("forgives spaces and case in the marker, but keeps the goal's own capitals", () => {
    const out = parseReply("Try it.\n[[ goal :  Say “thank you” to one compliment  ]]");
    expect(out.goal).toBe("Say “thank you” to one compliment");
    expect(out.text).toBe("Try it.");
  });

  it("takes a goal of up to 80 characters and drops a longer one, never showing the marker", () => {
    const eighty =
      "Notice one thing my body did for me today and write it down before I go to sleep";
    expect(eighty).toHaveLength(80);
    expect(parseReply(`A lovely idea.\n[[GOAL:${eighty}]]`).goal).toBe(eighty);
    const out = parseReply(`A lovely idea.\n[[GOAL:${eighty}!]]`);
    expect(out.goal).toBeUndefined();
    expect(out.text).toBe("A lovely idea.");
  });

  it("takes the first goal when Mira writes two", () => {
    const out = parseReply("Two ideas.\n[[GOAL:Walk ten minutes]]\n[[GOAL:Stretch]]");
    expect(out.goal).toBe("Walk ten minutes");
    expect(out.text).toBe("Two ideas.");
  });

  it("never offers a goal beside a crisis reply or an under-18 stop", () => {
    expect(
      parseReply(`Please reach out now.\n[[GOAL:Rest]]\n${CRISIS_TOKEN}`).goal
    ).toBeUndefined();
    expect(
      parseReply("I can only talk with adults.\n[[GOAL:Rest]]\n[[MINOR]]").goal
    ).toBeUndefined();
  });

  it("leaves other markers working beside it", () => {
    const out = parseReply("How long has it been?\n[[ASK:onset]]\n[[GOAL:Breathe slowly first]]");
    expect(out).toMatchObject({ ask: "onset", goal: "Breathe slowly first" });
    expect(out.text).toBe("How long has it been?");
  });
});

describe("the person's days and weeks", () => {
  it("reads the day in the person's own time zone", () => {
    const at = new Date("2026-11-21T23:30:00Z"); // a Saturday night in London
    expect(localDay(at, "Europe/London")).toBe("2026-11-21");
    expect(localDay(at, "Europe/Berlin")).toBe("2026-11-22");
    expect(localDay(at, "America/Los_Angeles")).toBe("2026-11-21");
    // A time zone the runtime doesn't know falls back to UTC rather than failing the page.
    expect(localDay(at, "Not/AZone")).toBe("2026-11-21");
  });

  it("starts a week on Monday", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23"); // a Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // across a new year
  });

  it("lets a tick be for today wherever on Earth it is now, and for no other day", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    expect(isTickableDay("2026-11-21", now)).toBe(true);
    expect(isTickableDay("2026-11-22", now)).toBe(true); // already Sunday in Kiritimati (UTC+14)
    expect(isTickableDay("2026-11-20", now)).toBe(false); // nowhere is it still Friday at noon UTC
    const late = new Date("2026-11-21T11:00:00Z");
    expect(isTickableDay("2026-11-20", late)).toBe(true); // 23:00 on Friday at UTC−12
    for (const bad of ["2026-11-23", "2026-02-30", "2026-13-01", "21.11.2026", "", "2026-11-2"]) {
      expect(isTickableDay(bad, now), bad).toBe(false);
    }
    // A day that doesn't exist, even where it would sort as "today".
    expect(isTickableDay("2026-11-31", new Date("2026-11-30T23:00:00Z"))).toBe(false);
  });
});

describe("a goal's progress", () => {
  // Saturday 21 Nov 2026; its week began on Monday 16 Nov.
  const today = "2026-11-21";

  it("counts this week's days against the weekly target, and today's tick", () => {
    const p = progress(
      { days: ["2026-11-21", "2026-11-17", "2026-11-15"], target: 3, since: "2026-11-01" },
      today
    );
    expect(p).toMatchObject({ thisWeek: 2, doneToday: true, total: 3, last: "2026-11-21" });
    const notToday = progress({ days: ["2026-11-17"], target: 3, since: "2026-11-01" }, today);
    expect(notToday).toMatchObject({ thisWeek: 1, doneToday: false });
    expect(progress({ days: [], target: null, since: today }, today)).toMatchObject({
      thisWeek: 0,
      doneToday: false,
      total: 0,
      last: null,
    });
  });

  it("draws the last 8 weeks, oldest first, with no bar before the goal was set", () => {
    const days = ["2026-11-20", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-03"];
    const p = progress({ days, target: 3, since: "2026-10-28" }, today);
    // Weeks of 28 Sep … 16 Nov; the goal was set in the week of 26 Oct.
    expect(p.weeks).toEqual([null, null, null, null, 0, 1, 3, 1]);
  });

  it("counts weeks in a row that met the target, and an unfinished week never breaks the run", () => {
    // Met in the weeks of 2, 9 and 16 Nov; not in the week of 26 Oct.
    const met = [
      "2026-10-27",
      "2026-11-02",
      "2026-11-04",
      "2026-11-09",
      "2026-11-10",
      "2026-11-16",
      "2026-11-17",
    ];
    expect(progress({ days: met, target: 2, since: "2026-10-26" }, today).streak).toBe(3);
    // This week isn't met yet (one tick of two): the run up to last week stands.
    const mid = met.filter((d) => d !== "2026-11-17");
    expect(progress({ days: mid, target: 2, since: "2026-10-26" }, today).streak).toBe(2);
    // A missed week ends it; nothing is lost from the total.
    const gap = ["2026-11-02", "2026-11-03", "2026-11-16", "2026-11-17"];
    const p = progress({ days: gap, target: 2, since: "2026-10-26" }, today);
    expect(p).toMatchObject({ streak: 1, total: 4 });
  });

  it("counts a week with any tick when there is no target", () => {
    const days = ["2026-11-03", "2026-11-12", "2026-11-19"];
    expect(progress({ days, target: null, since: "2026-11-01" }, today).streak).toBe(3);
  });
});
