import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
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

import { supabaseFetch } from "@features/admin/server/supabase";
import { askModel } from "@features/mira/server/model";
import {
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
  type NudgeUser,
} from "@features/mira/server/nudges";
import { addMessages } from "@features/mira/server/store";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-nudges-0123456789";
process.env.RESEND_API_KEY = "re_test";
process.env.NEXT_PUBLIC_SITE_URL = "https://staging.loveiq.org";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const NUDGE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHAT_ID = "99999999-8888-4777-8666-555555555555";
/** Tuesday 24 Nov 2026, 08:10 in Berlin. */
const TUESDAY_0810 = new Date("2026-11-24T07:10:00Z");

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

describe("nudge links", () => {
  it("stand for one id and one purpose, and can't be forged", () => {
    const t = makeToken("prefs", USER_ID)!;
    expect(readToken("prefs", t)).toBe(USER_ID);
    expect(readToken("open", t)).toBeNull();
    expect(readToken("prefs", `${USER_ID}.${"x".repeat(43)}`)).toBeNull();
    expect(readToken("prefs", `${NUDGE_ID}.${t.split(".")[1]}`)).toBeNull();
    expect(readToken("prefs", "")).toBeNull();
  });
});

describe("when a nudge is due", () => {
  it("is the half hour from the chosen time, on the person's own clock", () => {
    expect(inWindow(localParts(TUESDAY_0810, "Europe/Berlin"), "08:00")).toBe(true);
    expect(inWindow(localParts(TUESDAY_0810, "Europe/London"), "08:00")).toBe(false); // 07:10
    expect(inWindow(localParts(new Date("2026-11-24T07:31:00Z"), "Europe/Berlin"), "08:00")).toBe(
      false
    );
    expect(inWindow(localParts(new Date("2026-11-24T20:40:00Z"), "Europe/Berlin"), "21:30")).toBe(
      true
    );
  });

  it("waits out a pause, and twice a week means Tuesday and Friday", () => {
    expect(isDue(user(), TUESDAY_0810)).toBe(true);
    expect(isDue(user({ nudges_paused_until: "2026-12-01T00:00:00Z" }), TUESDAY_0810)).toBe(false);
    expect(isDue(user({ nudge_frequency: "twice_weekly" }), TUESDAY_0810)).toBe(true);
    const wednesday = new Date("2026-11-25T07:10:00Z");
    expect(isDue(user({ nudge_frequency: "twice_weekly" }), wednesday)).toBe(false);
  });

  it("names the next one for the saved screen", () => {
    const next = nextNudgeAt(user({ nudges_paused_until: "2026-12-08T12:00:00Z" }), TUESDAY_0810);
    expect(localParts(next, "Europe/Berlin").day).toBe("2026-12-09");
  });
});

describe("which kinds fit", () => {
  const base = {
    kept: null,
    lastType: null,
    daysSinceChat: 0,
    chattedYesterday: false,
    progressDay: false,
  };
  it("follows Sanjin's rules and never repeats the last kind", () => {
    expect(allowedTypes(base)).toEqual(["heard_of", "root_cause", "celebrate"]);
    expect(allowedTypes({ ...base, chattedYesterday: true, progressDay: true })).toEqual([
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
  it("has the kind's fixed subject, an escaped body and three ways to change nudges", () => {
    const e = nudgeEmail({
      type: "agreement",
      body: "Hi <b>Lea</b>, did it help?",
      openUrl: "https://x/open",
      prefsUrl: "https://x/prefs",
    });
    expect(e.subject).toBe("About what we agreed… – Mira, your body confidence coach");
    expect(e.html).toContain("Hi &lt;b&gt;Lea&lt;/b&gt;");
    expect(e.html).toContain("Tell Mira how it went");
    expect(e.html.match(/href="https:\/\/x\/prefs"/g)).toHaveLength(3);
    expect(e.text).toContain("https://x/prefs");
  });
});

describe("runNudges", () => {
  let lastNudge: Array<{ type: string; local_day: string }>;
  let crisis: Array<{ id: number }>;
  let lastSaid: string;
  let inserted: Array<Record<string, unknown>>;
  let patched: Array<Record<string, unknown>>;
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

  beforeEach(() => {
    vi.clearAllMocks();
    lastNudge = [];
    crisis = [];
    lastSaid = "2026-11-23T18:00:00Z"; // Monday 19:00 Berlin: yesterday, 13 h before
    inserted = [];
    patched = [];
    send.mockResolvedValue({ data: { id: "re_1" }, error: null });
    vi.mocked(askModel).mockResolvedValue({
      ok: true,
      text: '{"type":"agreement","body":"Hi Lea, we agreed on one soft lamp. Did you try it?"}',
      refused: false,
    });
    vi.mocked(supabaseFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/rest/v1/mira_user?")) return json([user()]);
      if (path.startsWith("/rest/v1/mira_nudge?user_id=")) return json(lastNudge);
      if (path.startsWith("/rest/v1/mira_event?")) return json(crisis);
      if (path.startsWith("/rest/v1/mira_message?select=created_at"))
        return json([{ created_at: lastSaid }]);
      if (path.startsWith("/rest/v1/mira_chat?")) return json([{ id: CHAT_ID }]);
      if (path.startsWith("/rest/v1/mira_message?chat_id="))
        return json([{ role: "user", content: "I'll leave one lamp on.", created_at: lastSaid }]);
      if (path.startsWith("/rest/v1/mira_nudge?on_conflict")) {
        inserted.push(JSON.parse(String(init?.body)));
        return json([{ id: NUDGE_ID }]);
      }
      if (path.startsWith(`/rest/v1/mira_nudge?id=eq.${NUDGE_ID}`)) {
        patched.push(JSON.parse(String(init?.body)));
        return json([]);
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it("sends one nudge, in the chat and by email, with a one-click unsubscribe", async () => {
    const summary = await runNudges(TUESDAY_0810);
    expect(summary.sent).toBe(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_ID,
      type: "agreement",
      local_day: "2026-11-24",
    });
    expect(addMessages).toHaveBeenCalledWith(CHAT_ID, [
      { role: "assistant", content: "Hi Lea, we agreed on one soft lamp. Did you try it?" },
    ]);
    const mail = send.mock.calls[0]![0];
    expect(mail.subject).toBe("About what we agreed… – Mira, your body confidence coach");
    expect(mail.from).toMatch(/^Mira </);
    expect(mail.headers["List-Unsubscribe"]).toContain("/api/mira/nudges/unsubscribe?t=");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    // Email links never point at staging (getEmailSiteUrl), only at the live site.
    expect(mail.html).toMatch(/https:\/\/www\.loveiq\.org\/api\/mira\/nudge\?t=/);
    expect(patched[0]).toMatchObject({ message_id: 501, resend_id: "re_1" });
  });

  it("sends nothing outside the person's time, twice a day, after a crisis or mid-chat", async () => {
    expect((await runNudges(new Date("2026-11-24T09:10:00Z"))).due).toBe(0);
    lastNudge = [{ type: "share", local_day: "2026-11-24" }];
    expect((await runNudges(TUESDAY_0810)).skipped["already-today"]).toBe(1);
    lastNudge = [];
    crisis = [{ id: 1 }];
    expect((await runNudges(TUESDAY_0810)).skipped["recent-crisis"]).toBe(1);
    crisis = [];
    lastSaid = "2026-11-24T05:00:00Z";
    expect((await runNudges(TUESDAY_0810)).skipped.chatting).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing when the model declines", async () => {
    vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text: '{"skip": true}', refused: false });
    const summary = await runNudges(TUESDAY_0810);
    expect(summary.skipped["model-declined"]).toBe(1);
    expect(inserted).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
