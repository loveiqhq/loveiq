import { describe, expect, it } from "vitest";
import { sessionEmail } from "@features/mira/server/session-emails";

const links = {
  open: "https://www.loveiq.org/mira/session",
  stop: "https://www.loveiq.org/mira/session/stop?t=x",
  oneClick: "https://www.loveiq.org/api/mira/weekly-session/stop?t=x",
  manage: "https://www.loveiq.org/mira/settings#weekly",
  book: "https://www.loveiq.org/mira/home",
  privacy: "https://www.loveiq.org/mira/privacy",
};
// Sunday 22 November 2026, 10:00 in Berlin.
const now = new Date("2026-11-22T09:00:00Z");
const berlin = { weekday: 2, time: "19:00", timeZone: "Europe/Berlin" };

describe("the weekly session's emails (22 Nov 2026 design)", () => {
  it("show the first start as a calendar entry: date tile, time, zone and length", () => {
    const e = sessionEmail("booked", { slot: berlin, links, googleUrl: "https://g/x", now });
    expect(e.text).toContain("Tuesdays at 19:00");
    expect(e.text).toContain("Berlin time · 15 minutes");
    expect(e.text).toContain("Starts Tuesday 24 November");
    expect(e.html).toMatch(/>Nov<\/div>[\s\S]*?>24<\/div>[\s\S]*?>Tue<\/div>/);
  });

  it("read the date where the session is, not where the server is", () => {
    // Monday 23:30 in Los Angeles is already Tuesday in UTC.
    const la = { weekday: 1, time: "23:30", timeZone: "America/Los_Angeles" };
    const e = sessionEmail("booked", { slot: la, links, googleUrl: "https://g/x", now });
    expect(e.text).toContain("Starts Monday 23 November");
    expect(e.text).toContain("Los Angeles time");
  });

  it("strike a cancelled time and offer only the links that still mean something", () => {
    const e = sessionEmail("cancelled", { slot: berlin, links, googleUrl: "https://g/x", now });
    expect(e.html).toContain("line-through");
    expect(e.text).not.toContain("Stop reminders");
    expect(e.text).toContain("Privacy: https://www.loveiq.org/mira/privacy");
    const booked = sessionEmail("booked", { slot: berlin, links, googleUrl: "https://g/x", now });
    expect(booked.text).toContain(`Stop reminders: ${links.stop}`);
  });
});
