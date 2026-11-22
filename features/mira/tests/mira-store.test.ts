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
  claimCodeAttempt,
  deleteAccount,
  deleteChats,
  listChats,
} from "@features/mira/server/store";

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

describe("deleting all chats", () => {
  it("also forgets the text of rated replies, but nothing the account still needs", async () => {
    await deleteChats(LEA.id);
    const all = calls().map((c) => c.call);
    expect(all).toContain(
      `PATCH /rest/v1/mira_event?user_id=eq.${LEA.id}&name=eq.rating&props->>rating=eq.1&props->>reply=not.is.null`
    );
    expect(all).toContain(`DELETE /rest/v1/mira_chat?user_id=eq.${LEA.id}`);
    expect(all.some((c) => c.includes("feedback") || c.includes("mira_sign_in_code"))).toBe(false);
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
