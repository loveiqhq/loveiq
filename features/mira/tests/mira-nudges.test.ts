import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@features/mira/server/model", () => ({
  askModel: vi.fn(),
  isModelConfigured: vi.fn().mockReturnValue(true),
}));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([501]),
  logMiraEvent: vi.fn(),
}));
vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { askModel } from "@features/mira/server/model";
import { describePrefs, getNudgePrefs, type NudgePrefs } from "@features/mira/server/nudge-prefs";
import {
  NUDGE_KINDS,
  allowedTypes,
  inWindow,
  isDue,
  localParts,
  makeToken,
  nextNudgeAt,
  nudgeEmail,
  parseNudge,
  readToken,
  runNudges,
  type NudgeTime,
  type NudgeUser,
} from "@features/mira/server/nudges";
import { addMessages } from "@features/mira/server/store";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-nudges-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://staging.loveiq.org";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const CHAT_ID = "99999999-8888-4777-8666-555555555555";
/** Tuesday 24 Nov 2026, 08:10 in Berlin. */
const TUESDAY_0810 = new Date("2026-11-24T07:10:00Z");
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

const user = (over: Partial<NudgeUser> = {}): NudgeUser => ({
  id: USER_ID,
  email: "lea@example.com",
  name: "Lea",
  created_at: "2026-11-18T10:00:00Z",
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  nudge_frequency: "daily",
  nudge_types: null,
  nudges_paused_until: null,
  ...over,
});

const PREFS: NudgePrefs = {
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  nudge_frequency: "daily",
  nudge_types: null,
  nudges_paused_until: null,
  nudges_stopped_at: null,
};

describe("nudge links", () => {
  it("stand for one id and one purpose, and can't be forged", () => {
    const t = makeToken("prefs", USER_ID)!;
    expect(readToken("prefs", t)).toBe(USER_ID);
    expect(readToken("open", t)).toBeNull();
    expect(readToken("prefs", `${USER_ID}.${"x".repeat(43)}`)).toBeNull();
    expect(readToken("prefs", `${CHAT_ID}.${t.split(".")[1]}`)).toBeNull();
    expect(readToken("prefs", "")).toBeNull();
  });
});

describe("when a nudge is due", () => {
  it("is the hour from the chosen time, on the person's own clock", () => {
    expect(inWindow(localParts(TUESDAY_0810, "Europe/Berlin"), "08:00")).toBe(true);
    expect(inWindow(localParts(TUESDAY_0810, "Europe/London"), "08:00")).toBe(false); // 07:10
    // 08:35, the slot's second run, still counts; 09:00 is past it.
    const at = (iso: string) => localParts(new Date(iso), "Europe/Berlin");
    expect(inWindow(at("2026-11-24T07:35:00Z"), "08:00")).toBe(true);
    expect(inWindow(at("2026-11-24T08:00:00Z"), "08:00")).toBe(false);
    expect(inWindow(at("2026-11-24T20:40:00Z"), "21:30")).toBe(true);
  });

  it("gets two of the cron's runs for every slot, in whole, half and quarter-hour time zones", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const schedule = vercel.crons.find((c) => c.path === "/api/cron/mira-nudges")!.schedule;
    const runMinutes = schedule.split(" ")[0]!.split(",").map(Number); // past each UTC hour
    for (const offset of [0, 60, 330, 345, -210]) {
      for (const slot of ["08:00", "19:00", "21:30"] as NudgeTime[]) {
        let runs = 0;
        for (let utc = 0; utc < 1440; utc++) {
          if (!runMinutes.includes(utc % 60)) continue;
          const minutes = (((utc + offset) % 1440) + 1440) % 1440;
          if (inWindow({ day: "", weekday: "", minutes }, slot)) runs++;
        }
        expect(runs, `${slot} at UTC${offset >= 0 ? "+" : ""}${offset / 60}`).toBe(2);
      }
    }
  });

  it("waits out a pause, and twice a week means Tuesday and Friday", () => {
    expect(isDue(user(), TUESDAY_0810)).toBe(true);
    expect(isDue(user({ nudges_paused_until: "2026-12-01T00:00:00Z" }), TUESDAY_0810)).toBe(false);
    expect(isDue(user({ nudge_frequency: "twice_weekly" }), TUESDAY_0810)).toBe(true);
    const wednesday = new Date("2026-11-25T07:10:00Z");
    expect(isDue(user({ nudge_frequency: "twice_weekly" }), wednesday)).toBe(false);
  });

  it("names the next one for the saved screen, never a day whose nudge already went", () => {
    const next = nextNudgeAt(user({ nudges_paused_until: "2026-12-08T12:00:00Z" }), TUESDAY_0810);
    expect(localParts(next, "Europe/Berlin").day).toBe("2026-12-09");
    const day = (d: Date) => localParts(d, "Europe/Berlin").day;
    expect(day(nextNudgeAt(user(), TUESDAY_0810))).toBe("2026-11-24");
    expect(day(nextNudgeAt(user(), TUESDAY_0810, "2026-11-24"))).toBe("2026-11-25");
    // Saved at 08:10, after the 08:05 nudge: not "today".
    expect(describePrefs({ ...PREFS, last_sent_day: "2026-11-24" }, TUESDAY_0810).next).toBe(
      "Wednesday, 08:00 your time"
    );
    expect(describePrefs(PREFS, TUESDAY_0810).next).toBe("Tuesday, 08:00 your time");
  });

  it("reads the day of the last nudge that went, for that next date", async () => {
    vi.mocked(supabaseFetch).mockClear();
    vi.mocked(supabaseFetch).mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_nudge?") ? json([{ local_day: "2026-11-24" }]) : json([PREFS])
    );
    expect((await getNudgePrefs(USER_ID))?.last_sent_day).toBe("2026-11-24");
    const read = vi
      .mocked(supabaseFetch)
      .mock.calls.find(([p]) => String(p).startsWith("/rest/v1/mira_nudge?"));
    expect(read?.[0]).toContain("sent_at=not.is.null");
  });
});

describe("which kinds fit", () => {
  const base = {
    kept: null,
    lastType: null,
    daysSinceChat: 0,
    chattedYesterday: false,
    progressDue: false,
  };
  it("follows Sanjin's rules and never repeats the last kind", () => {
    expect(allowedTypes(base)).toEqual(["heard_of", "root_cause", "celebrate"]);
    expect(allowedTypes({ ...base, chattedYesterday: true, progressDue: true })).toEqual([
      "agreement",
      "progress",
      "heard_of",
      "root_cause",
      "celebrate",
    ]);
    expect(allowedTypes({ ...base, daysSinceChat: 2, lastType: "root_cause" })).toEqual([
      "heard_of",
      "share",
      "celebrate",
    ]);
    expect(allowedTypes({ ...base, kept: ["share", "root_cause"] })).toEqual(["root_cause"]);
  });
});

describe("the model's nudge", () => {
  it("is used only when it is one of today's kinds, with a real body", () => {
    const ok = parseNudge(
      'Here: {"type":"agreement","body":"Hi Lea, did the lamp help? Tell me."}',
      ["agreement"]
    );
    expect(ok).toEqual({ type: "agreement", body: "Hi Lea, did the lamp help? Tell me." });
    expect(parseNudge('{"skip": true}', ["agreement"])).toBeNull();
    expect(
      parseNudge('{"type":"share","body":"Hi Lea, anything on your mind?"}', ["agreement"])
    ).toBeNull();
    expect(parseNudge('{"type":"agreement","body":"Hi"}', ["agreement"])).toBeNull();
    expect(parseNudge("not json", ["agreement"])).toBeNull();
  });
});

describe("the email", () => {
  const e = nudgeEmail({
    type: "agreement",
    body: "Hi <b>Lea</b>, did it help?",
    openUrl: "https://x/open",
    prefsUrl: "https://x/prefs",
  });

  it("has the kind's neutral subject, an escaped body and three ways to change nudges", () => {
    expect(e.subject).toBe("About what we agreed…");
    expect(e.html).toContain("Hi &lt;b&gt;Lea&lt;/b&gt;");
    expect(e.html).toContain("Tell Mira how it went");
    expect(e.html.match(/href="https:\/\/x\/prefs"/g)).toHaveLength(3);
    expect(e.text).toContain("https://x/prefs");
  });

  it("shows an inbox preview only a neutral, hidden line, never the body", () => {
    const firstText = e.html
      .replace(/<[^>]+>/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean);
    expect(firstText).toMatch(/^A short note for you\./);
    expect(e.html).toMatch(/<div style="display: none;[^"]*overflow: hidden[^"]*">A short note/);
  });

  it("is signed by Applied Psychometrics, not LoveIQ", () => {
    expect(e.html).toContain(">Applied Psychometrics</p>");
    expect(e.html).not.toContain("LoveIQ");
  });

  it("keeps every kind's subject free of what the chats are about", () => {
    for (const k of NUDGE_KINDS) {
      expect(k.teaser).not.toMatch(/body|sex|intima|partner|confiden|weight|naked|mira/i);
    }
  });
});

describe("runNudges", () => {
  type Row = { type: string; local_day: string; sent_at: string | null; created_at: string };
  let users: NudgeUser[];
  let nudges: Row[];
  let crisis: Array<{ id: number }>;
  let checks: Array<{ scale: string; answers: number[] }>;
  let lastSaid: string;
  let claims: Map<string, string>;
  let inserted: Array<Record<string, unknown>>;
  let patched: Array<Record<string, unknown>>;
  let deleted: string[];
  const AGREEMENT =
    '{"type":"agreement","body":"Hi Lea, we agreed on one soft lamp. Did you try it?"}';
  const kindsOffered = () =>
    /Kinds you may choose today: ([^.]*)\./
      .exec(String(vi.mocked(askModel).mock.calls.at(-1)?.[1]))![1]!
      .split(", ");

  beforeEach(() => {
    vi.clearAllMocks();
    users = [user()];
    nudges = [];
    crisis = [];
    checks = [];
    lastSaid = "2026-11-23T18:00:00Z"; // Monday 19:00 Berlin: yesterday, 13 h before
    claims = new Map();
    inserted = [];
    patched = [];
    deleted = [];
    // Reset, not just cleared: a one-off value a failed test left unused must not leak on.
    send.mockReset().mockResolvedValue({ data: { id: "re_1" }, error: null });
    vi.mocked(askModel)
      .mockReset()
      .mockResolvedValue({ ok: true, text: AGREEMENT, refused: false });
    vi.mocked(fetchAllRows).mockImplementation(async () => users);
    vi.mocked(supabaseFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/rest/v1/mira_nudge?user_id=")) {
        // The filters the code sends, newest first, one row: a small stand-in for PostgREST.
        const type = /type=eq\.(\w+)/.exec(path)?.[1];
        const found = nudges
          .filter((n) => !path.includes("sent_at=not.is.null") || n.sent_at !== null)
          .filter((n) => !type || n.type === type)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return json(found.slice(0, 1));
      }
      if (path.startsWith("/rest/v1/mira_event?")) return json(crisis);
      if (path.startsWith("/rest/v1/mira_check?")) return json(checks);
      if (path.startsWith("/rest/v1/mira_message?select=created_at"))
        return json([{ created_at: lastSaid }]);
      if (path.startsWith("/rest/v1/mira_chat?")) return json([{ id: CHAT_ID }]);
      if (path.startsWith("/rest/v1/mira_message?chat_id="))
        return json([{ role: "user", content: "I'll leave one lamp on.", created_at: lastSaid }]);
      if (path.startsWith("/rest/v1/mira_nudge?on_conflict")) {
        // unique (user_id, local_day): a day already claimed returns no row.
        const row = JSON.parse(String(init?.body)) as Record<string, string>;
        const day = `${row.user_id}/${row.local_day}`;
        if ([...claims.values()].includes(day)) return json([]);
        const id = `aaaaaaaa-bbbb-4ccc-8ddd-${String(inserted.length).padStart(12, "0")}`;
        claims.set(id, day);
        inserted.push(row);
        return json([{ id }]);
      }
      if (path.startsWith("/rest/v1/mira_nudge?id=eq.")) {
        const id = path.slice("/rest/v1/mira_nudge?id=eq.".length);
        if (init?.method === "DELETE") {
          claims.delete(id);
          deleted.push(id);
        } else patched.push(JSON.parse(String(init?.body)));
        return json([]);
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it("sends one nudge by email, then puts it in the chat, with a one-click unsubscribe", async () => {
    const summary = await runNudges(TUESDAY_0810);
    expect(summary.sent).toBe(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_ID,
      type: "agreement",
      subject: "About what we agreed…",
      local_day: "2026-11-24",
    });
    // The words live only in the chat, so they go when the chat goes.
    expect(inserted[0]).not.toHaveProperty("body");
    expect(addMessages).toHaveBeenCalledWith(CHAT_ID, [
      { role: "assistant", content: "Hi Lea, we agreed on one soft lamp. Did you try it?" },
    ]);
    // The chat gets the nudge only once its email has gone.
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(addMessages).mock.invocationCallOrder[0]!
    );
    const mail = send.mock.calls[0]![0];
    expect(mail.subject).toBe("About what we agreed…");
    expect(mail.from).toMatch(/^Mira </);
    expect(mail.headers["List-Unsubscribe"]).toContain("/api/mira/nudges/unsubscribe?t=");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // The row id rides along, so the Resend webhook can record delivery and the first open.
    expect(mail.tags).toEqual([{ name: "mira_nudge", value: expect.stringMatching(/^aaaaaaaa-/) }]);
    // Email links never point at staging (getEmailSiteUrl), only at the live site.
    expect(mail.html).toMatch(/https:\/\/www\.loveiq\.org\/api\/mira\/nudge\?t=/);
    // Marked sent first, then the chat copy's id.
    expect(patched[0]).toMatchObject({ resend_id: "re_1" });
    expect(patched[0]!.sent_at).toEqual(expect.any(String));
    expect(patched[1]).toEqual({ message_id: 501 });
    // A retried send call can't mail it twice.
    expect(send.mock.calls[0]![1]).toEqual({
      idempotencyKey: expect.stringMatching(/^mira-nudge-/),
    });
    // The text part opens with the neutral line too.
    expect(mail.text.startsWith("A short note for you.")).toBe(true);
    expect(deleted).toEqual([]);
  });

  it("sends nothing outside the person's time, twice a day, after a crisis or mid-chat", async () => {
    expect((await runNudges(new Date("2026-11-24T09:10:00Z"))).due).toBe(0);
    nudges = [
      {
        type: "share",
        local_day: "2026-11-24",
        sent_at: "2026-11-24T07:05:00Z",
        created_at: "2026-11-24T07:05:00Z",
      },
    ];
    expect((await runNudges(TUESDAY_0810)).skipped["already-today"]).toBe(1);
    nudges = [];
    crisis = [{ id: 1 }];
    expect((await runNudges(TUESDAY_0810)).skipped["recent-crisis"]).toBe(1);
    crisis = [];
    lastSaid = "2026-11-24T05:00:00Z";
    expect((await runNudges(TUESDAY_0810)).skipped.chatting).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the same 14 days' quiet after the mood check's question 9 opened the support lines", async () => {
    // Read from the person's own results (the panel's event carries no account).
    checks = [{ scale: "phq9", answers: [0, 0, 0, 0, 0, 0, 0, 0, 1] }];
    expect((await runNudges(TUESDAY_0810)).skipped["recent-crisis"]).toBe(1);
    const read = vi
      .mocked(supabaseFetch)
      .mock.calls.map(([p]) => String(p))
      .find((p) => p.startsWith("/rest/v1/mira_check?"))!;
    expect(read).toContain(`user_id=eq.${USER_ID}&`);
    expect(decodeURIComponent(read)).toContain("created_at=gte.2026-11-10T07:10:00.000Z");
    expect(send).not.toHaveBeenCalled();
    // A high total without that answer is the professional step, not a crisis.
    checks = [
      { scale: "phq9", answers: [3, 3, 3, 3, 3, 3, 3, 3, 0] },
      { scale: "gad7", answers: [3, 3, 3, 3, 3, 3, 3] },
    ];
    expect((await runNudges(TUESDAY_0810)).sent).toBe(1);
  });

  it("sends nothing when the model declines", async () => {
    vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text: '{"skip": true}', refused: false });
    const summary = await runNudges(TUESDAY_0810);
    expect(summary.skipped["model-declined"]).toBe(1);
    expect(inserted).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("gives the day back when the email fails, and leaves the chat alone", async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: "application_error", message: "x" } });
    send.mockRejectedValueOnce(new Error("socket hang up"));
    for (let run = 0; run < 2; run++) {
      const summary = await runNudges(TUESDAY_0810);
      expect(summary).toMatchObject({ sent: 0, errors: 1 });
    }
    expect(deleted).toHaveLength(2);
    expect(claims.size).toBe(0);
    expect(addMessages).not.toHaveBeenCalled();
    expect(patched).toHaveLength(0);
  });

  it("keeps a nudge that went marked as sent even when its chat copy fails", async () => {
    vi.mocked(addMessages).mockRejectedValueOnce(new Error("db blip"));
    const summary = await runNudges(TUESDAY_0810);
    expect(summary).toMatchObject({ sent: 1, errors: 1 });
    expect(deleted).toEqual([]);
    expect(patched[0]!.sent_at).toEqual(expect.any(String));
  });

  it("lets the slot's second run send what the first could not", async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: "application_error", message: "x" } });
    expect((await runNudges(TUESDAY_0810)).errors).toBe(1);
    const second = await runNudges(new Date("2026-11-24T07:35:00Z")); // 08:35 in Berlin
    expect(second.sent).toBe(1);
  });

  it("never repeats a kind that went, and ignores a claimed day whose email never did", async () => {
    nudges = [
      {
        type: "agreement",
        local_day: "2026-11-23",
        sent_at: null,
        created_at: "2026-11-23T07:05:00Z",
      },
    ];
    expect((await runNudges(TUESDAY_0810)).sent).toBe(1);
    expect(kindsOffered()).toContain("agreement");
    nudges[0]!.sent_at = "2026-11-23T07:06:00Z";
    await runNudges(TUESDAY_0810);
    expect(kindsOffered()).not.toContain("agreement");
  });

  it("offers progress once a week after the last one that went, whatever the weekday", async () => {
    const sent = (type: string, day: string) => ({
      type,
      local_day: day,
      sent_at: `${day}T07:05:00Z`,
      created_at: `${day}T07:04:00Z`,
    });
    users = [user({ created_at: "2026-11-04T10:00:00Z" })]; // a Wednesday; today is a Tuesday
    await runNudges(TUESDAY_0810);
    expect(kindsOffered()).toContain("progress");
    nudges = [sent("progress", "2026-11-21"), sent("share", "2026-11-23")];
    await runNudges(TUESDAY_0810);
    expect(kindsOffered()).not.toContain("progress");
    nudges = [sent("progress", "2026-11-16"), sent("share", "2026-11-23")];
    await runNudges(TUESDAY_0810);
    expect(kindsOffered()).toContain("progress");
    // A new account waits a week for its first.
    nudges = [];
    users = [user({ created_at: "2026-11-20T10:00:00Z" })];
    await runNudges(TUESDAY_0810);
    expect(kindsOffered()).not.toContain("progress");
  });

  it("reads every candidate, past PostgREST's 1,000-row page", async () => {
    users = Array.from({ length: 1500 }, () => user({ nudge_time: "19:00" }));
    const summary = await runNudges(TUESDAY_0810);
    expect(summary).toMatchObject({ candidates: 1500, due: 0 });
    expect(vi.mocked(fetchAllRows).mock.calls[0]![0]).toMatch(/order=created_at\.asc,id\.asc$/);
  });

  it("never reads in anyone who said they are under 18, even with nudges on again", async () => {
    await runNudges(TUESDAY_0810);
    expect(vi.mocked(fetchAllRows).mock.calls[0]![0]).toContain("&minor_at=is.null&");
  });

  it("nudges four people at a time", async () => {
    users = Array.from({ length: 8 }, (_, i) =>
      user({ id: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}` })
    );
    let inFlight = 0;
    let most = 0;
    vi.mocked(askModel).mockImplementation(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, text: AGREEMENT, refused: false };
    });
    expect((await runNudges(TUESDAY_0810)).sent).toBe(8);
    expect(most).toBe(4);
  });

  it("starts nobody once the run's time is spent, and says so", async () => {
    const summary = await runNudges(TUESDAY_0810, { outOfTime: () => true });
    expect(summary).toMatchObject({ due: 1, sent: 0, stoppedEarly: true });
    expect(askModel).not.toHaveBeenCalled();
  });
});
