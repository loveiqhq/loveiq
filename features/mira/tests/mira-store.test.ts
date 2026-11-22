import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { memberByEmail } from "@features/brain/server/sign-in";
import { SESSION_OPENING } from "@features/mira/server/calendar";
import {
  addMessages,
  claimCodeAttempt,
  deleteAccount,
  deleteChat,
  deleteChats,
  getMessages,
  goalTexts,
  listChats,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import { fakeDb } from "./fake-db";

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const BROWSER = "aBcD1234eFgH5678iJkL9012";

/** Every call as "METHOD path", with its body; admin_users answers `staff`. */
function database(staff: unknown[] | "down" = []) {
  vi.mocked(supabaseFetch).mockImplementation(async (path: string) => {
    if (path.includes("name=eq.signup_completed&select=anon_id")) {
      // Lea signed up from this browser; her pre-sign-up ratings and feedback carry only its id.
      return new Response(JSON.stringify([{ anon_id: BROWSER }, { anon_id: BROWSER }]), {
        status: 200,
      });
    }
    if (path.startsWith("/rest/v1/admin_users")) {
      return staff === "down"
        ? new Response("oops", { status: 503 })
        : new Response(JSON.stringify(staff), { status: 200 });
    }
    return new Response(null, { status: 204 });
  });
}
const calls = () =>
  vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
    call: `${init?.method ?? "GET"} ${path}`,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
const deletesLogin = () => calls().some((c) => c.call.startsWith("DELETE /auth/v1/admin/users/"));
const deletesProfile = () =>
  calls().some((c) => c.call === `DELETE /rest/v1/mira_user?id=eq.${LEA.id}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(memberByEmail).mockResolvedValue(null);
  database();
});

describe("deleting a Mira account", () => {
  it("deletes the login of someone who is only a Mira user", async () => {
    await deleteAccount(LEA);
    expect(deletesLogin()).toBe(true);
    expect(deletesProfile()).toBe(false);
  });

  it("keeps a staff, Jarvis or unknown login and deletes only Mira's account", async () => {
    for (const setup of [
      () => database([{ email: LEA.email }]), // admin_users
      () => vi.mocked(memberByEmail).mockResolvedValueOnce({ name: "Lea", email: LEA.email }),
      () => database("down"), // admin_users can't be read
      () => vi.mocked(memberByEmail).mockRejectedValueOnce(new Error("registry down")),
    ]) {
      vi.mocked(supabaseFetch).mockClear();
      database();
      setup();
      await deleteAccount(LEA);
      expect(deletesProfile()).toBe(true);
      expect(deletesLogin()).toBe(false);
    }
  });

  it("first forgets the person's words in the KPI log and their sign-in code", async () => {
    await deleteAccount(LEA);
    const all = calls();
    const mine = `/rest/v1/mira_event?user_id=eq.${LEA.id}`;
    const at = (call: string) => all.findIndex((c) => c.call === call);
    const login = all.findIndex((c) => c.call.startsWith("DELETE /auth/v1/admin/users/"));
    for (const [call, body] of [
      [
        `PATCH ${mine}&name=eq.rating&props->>rating=eq.1&props->>reply=not.is.null`,
        { props: { rating: 1 } },
      ],
      [
        `PATCH ${mine}&name=eq.rating&props->>rating=eq.-1&props->>reply=not.is.null`,
        { props: { rating: -1 } },
      ],
      [`DELETE ${mine}&name=eq.feedback`, undefined],
      // What she rated or wrote in her browser before signing up goes too.
      [
        `PATCH /rest/v1/mira_event?anon_id=in.(${BROWSER})&name=eq.rating&props->>rating=eq.1&props->>reply=not.is.null`,
        { props: { rating: 1 } },
      ],
      [`DELETE /rest/v1/mira_event?anon_id=in.(${BROWSER})&name=eq.feedback`, undefined],
      [`PATCH ${mine}&name=eq.nudge_stopped&props->>reason=not.is.null`, { props: {} }],
      ["DELETE /rest/v1/mira_sign_in_code?email=eq.lea%40example.com", undefined],
    ] as const) {
      expect(at(call), call).toBeGreaterThanOrEqual(0);
      expect(at(call), call).toBeLessThan(login);
      expect(all[at(call)]!.body).toEqual(body);
    }
  });

  it("unlinks what stays in the log from her browsers too, so a new sign-up there can't re-link it (ID-16)", async () => {
    // The notice: "the rest is no longer linked to you". The rows keep their user_id until the
    // account goes (ON DELETE SET NULL); the browser id would link them again, so it goes too.
    await deleteAccount(LEA);
    const all = calls();
    const at = (call: string) => all.findIndex((c) => c.call === call);
    const login = all.findIndex((c) => c.call.startsWith("DELETE /auth/v1/admin/users/"));
    const browser = `PATCH /rest/v1/mira_event?anon_id=in.(${BROWSER})&user_id=is.null`;
    const own = `PATCH /rest/v1/mira_event?user_id=eq.${LEA.id}&anon_id=not.is.null`;
    for (const call of [browser, own]) {
      expect(at(call), call).toBeGreaterThanOrEqual(0);
      expect(all[at(call)]!.body, call).toEqual({ anon_id: null });
      expect(at(call), call).toBeLessThan(login);
    }
    // After the words were found and removed through that same browser id.
    expect(at(browser)).toBeGreaterThan(
      at(`DELETE /rest/v1/mira_event?anon_id=in.(${BROWSER})&name=eq.feedback`)
    );
  });

  it("deletes nothing more once a step fails, so a retry starts over", async () => {
    vi.mocked(supabaseFetch).mockImplementation(async (path: string) =>
      path.includes("name=eq.feedback")
        ? new Response("oops", { status: 500 })
        : new Response(null, { status: 204 })
    );
    await expect(deleteAccount(LEA)).rejects.toThrow(/cleanup failed/);
    expect(deletesLogin()).toBe(false);
  });
});

// Round-3 R3-ACCT-4 (lead decision): a code sign-in on another device, with the optional box left
// empty, silently turned "Mira may use my LoveIQ result" off. Only the first sign-up sets it.
describe("the profile at sign-in", () => {
  const sent = () =>
    vi.mocked(supabaseFetch).mock.calls.map(([path, init]) => ({
      call: `${init?.method ?? "GET"} ${path}`,
      prefer: (init?.headers as Record<string, string> | undefined)?.Prefer,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));
  const answer = (made: unknown[]) =>
    vi
      .mocked(supabaseFetch)
      .mockImplementation(async (_path, init) =>
        init?.method === "POST"
          ? new Response(JSON.stringify(made), { status: 201 })
          : new Response(JSON.stringify([{ id: LEA.id, use_assessment: true }]), { status: 200 })
      );

  it("takes the LoveIQ tick when the sign-in makes the account", async () => {
    answer([{ id: LEA.id, use_assessment: true }]);
    const p = await upsertProfileAtSignIn(LEA.id, LEA.email, "v2", { useAssessment: true });
    expect(p).toMatchObject({ use_assessment: true });
    const [insert, ...rest] = sent();
    expect(insert).toMatchObject({
      call: "POST /rest/v1/mira_user?on_conflict=id",
      // An existing account is left as it is: never merged over.
      prefer: "resolution=ignore-duplicates,return=representation",
      body: { id: LEA.id, email: LEA.email, consent_version: "v2", use_assessment: true },
    });
    expect(rest).toEqual([]);
  });

  it("renews a returning account's consent and address, never its LoveIQ choice", async () => {
    answer([]); // the account was there: the insert did nothing
    const p = await upsertProfileAtSignIn(LEA.id, LEA.email, "v2", { useAssessment: false });
    expect(p).toMatchObject({ use_assessment: true }); // as saved in Settings
    const renew = sent()[1]!;
    expect(renew).toMatchObject({
      call: `PATCH /rest/v1/mira_user?id=eq.${LEA.id}`,
      body: { email: LEA.email, consent_version: "v2" },
    });
    expect(renew.body).not.toHaveProperty("use_assessment");
    expect(renew.body.consent_at).toEqual(expect.any(String));
  });
});

describe("deleting all chats", () => {
  it("also forgets the text of rated replies, but nothing the account still needs", async () => {
    await deleteChats(LEA.id);
    const all = calls().map((c) => c.call);
    expect(all).toContain(
      `PATCH /rest/v1/mira_event?user_id=eq.${LEA.id}&name=eq.rating&props->>rating=eq.1&props->>reply=not.is.null`
    );
    expect(all).toContain(`DELETE /rest/v1/mira_chat?user_id=eq.${LEA.id}`);
    expect(all.some((c) => c.includes("feedback") || c.includes("mira_sign_in_code"))).toBe(false);
    // The account stays, so its log stays linked to it.
    expect(calls().some((c) => c.body?.anon_id === null)).toBe(false);
  });
});

describe("guessing an emailed code", () => {
  it("allows 25 guesses per code: the low cap is per address and network, in the route", async () => {
    vi.mocked(supabaseFetch).mockResolvedValueOnce(new Response("true", { status: 200 }));
    expect(await claimCodeAttempt(LEA.email)).toBe(true);
    const body = JSON.parse(String(vi.mocked(supabaseFetch).mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ p_email: LEA.email, p_max: 25 });
  });
});

// Round-2 audit CHAT-17 (lead decision 5) and UX-14: the title a chat is shown with.
describe("listChats titles", () => {
  const row = (title: string, created_at: string, time_zone: string | null) => ({
    id: crypto.randomUUID(),
    title,
    updated_at: created_at,
    created_at,
    mira_user: time_zone ? { time_zone } : null,
  });

  it("names a weekly session's chat and a chat opened by crisis words by their date, in the person's zone", async () => {
    vi.mocked(supabaseFetch).mockResolvedValue(
      new Response(
        JSON.stringify([
          // 01:30 UTC on Wednesday is 20:30 on Tuesday in New York.
          row(SESSION_OPENING, "2026-11-25T01:30:00Z", "America/New_York"),
          row("I don’t want to live anymore", "2026-11-22T09:06:00Z", "Europe/Berlin"),
          row("I only feel okay with the lights off", "2026-11-21T10:00:00Z", "Europe/Berlin"),
          row(SESSION_OPENING, "2026-11-25T01:30:00Z", null), // no zone: UTC
        ]),
        { status: 200 }
      )
    );
    const chats = await listChats(LEA.id);
    expect(chats.map((c) => c.title)).toEqual([
      "Weekly session · Tue 24 Nov",
      "Chat on 22 Nov",
      "I only feel okay with the lights off",
      "Weekly session · Wed 25 Nov",
    ]);
    expect(Object.keys(chats[0]!)).toEqual(["id", "title", "updated_at"]);
    expect(String(vi.mocked(supabaseFetch).mock.calls[0]![0])).toContain(
      "select=id,title,updated_at,created_at,mira_user(time_zone)"
    );
  });
});

// Round-2 audit CHAT-29, lead decision 4: one chat can be deleted, not only all of them.
describe("deleteChat", () => {
  const OTHER = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
  const [ONE, TWO, THEIRS] = [
    "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
    "7a3d5b2f-2222-4333-8444-a55566667777",
    "8b4e6c3a-3333-4444-8555-b66677778888",
  ];

  it("deletes that chat of the account's and nothing else, and refuses anyone else's", async () => {
    const db = fakeDb({
      mira_chat: [
        { id: ONE, user_id: LEA.id, title: "One" },
        { id: TWO, user_id: LEA.id, title: "Two" },
        { id: THEIRS, user_id: OTHER, title: "Theirs" },
      ],
    });
    vi.mocked(supabaseFetch).mockImplementation(db.handle);
    expect(await deleteChat(LEA.id, ONE)).toBe(true);
    expect(db.tables.mira_chat!.map((c) => c.id)).toEqual([TWO, THEIRS]);
    expect(await deleteChat(LEA.id, THEIRS)).toBe(false);
    expect(await deleteChat(LEA.id, "not-a-chat")).toBe(false);
    expect(db.tables.mira_chat!.map((c) => c.id)).toEqual([TWO, THEIRS]);
    // The rated replies' words an older event may keep go too, as with Delete all chats.
    expect(db.calls.some((c) => c.startsWith("PATCH /rest/v1/mira_event?user_id=eq."))).toBe(true);
  });
});

// Round-2 audit CHAT-9, lead decision 3: Mira's goal offer is kept with her reply.
describe("goal offers with Mira's replies", () => {
  const CHAT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
  const STEP = "Leave one soft light on for the first minute";
  const inserts = () =>
    vi
      .mocked(supabaseFetch)
      .mock.calls.filter(
        ([p, i]) => i?.method === "POST" && String(p).startsWith("/rest/v1/mira_message")
      )
      .map(([, i]) => JSON.parse(String(i!.body)) as Array<Record<string, unknown>>);

  it("stores the offer with the reply and reads it back with the chat", async () => {
    const db = fakeDb({ mira_chat: [{ id: CHAT, user_id: LEA.id, title: "One" }] });
    vi.mocked(supabaseFetch).mockImplementation(db.handle);
    await addMessages(CHAT, [
      { role: "user", content: "I want to try something small" },
      { role: "assistant", content: "Try this.", goal: STEP },
    ]);
    // PostgREST refuses a bulk insert whose rows don't share their keys (PGRST102).
    const [rows] = inserts();
    expect(rows!.map((r) => r.goal)).toEqual([null, STEP]);
    // Without an offer there is no goal key at all.
    await addMessages(CHAT, [{ role: "user", content: "and then?" }]);
    expect(inserts()[1]![0]).not.toHaveProperty("goal");
    const read = await getMessages(LEA.id, CHAT);
    expect(read.find((m) => m.role === "assistant")?.goal).toBe(STEP);
    expect(db.calls).toContainEqual(
      expect.stringContaining("select=id,role,content,sources,rating,ask,goal&")
    );
  });

  it('lists the texts of the account\'s own goals, for "Added"', async () => {
    const db = fakeDb({
      mira_goal: [
        { id: "g1", user_id: LEA.id, text: STEP },
        { id: "g2", user_id: "someone-else", text: "Not hers" },
      ],
    });
    vi.mocked(supabaseFetch).mockImplementation(db.handle);
    expect(await goalTexts(LEA.id)).toEqual([STEP]);
  });
});
