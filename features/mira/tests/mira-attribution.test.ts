import { beforeEach, describe, expect, it, vi } from "vitest";

/** The request the code runs in: its headers, or null outside one (a cron's own work, a test). */
const req = vi.hoisted(() => ({ headers: null as Headers | null }));
vi.mock("next/headers", () => ({
  headers: () => {
    if (!req.headers) throw new Error("`headers` was called outside a request scope");
    return Promise.resolve(req.headers);
  },
  // As Next does: each value URI-decoded.
  cookies: () => {
    if (!req.headers) throw new Error("`cookies` was called outside a request scope");
    const jar = new Map(
      (req.headers.get("cookie") ?? "")
        .split(/; */)
        .filter(Boolean)
        .map((pair) => {
          const at = pair.indexOf("=");
          return [pair.slice(0, at), decodeURIComponent(pair.slice(at + 1))] as const;
        })
    );
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    });
  },
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { requestExtras, sourceProps } from "@features/mira/server/attribution";
import { SOURCE_COOKIE, SOURCE_HEADER } from "@features/mira/server/config";
import { logMiraEvent, upsertProfileAtSignIn } from "@features/mira/server/store";
import { flushAfterResponse } from "@shared/http/after-response";

const sent = (v: object) => encodeURIComponent(JSON.stringify(v));
const request = (h: Record<string, string>) => {
  req.headers = new Headers(h);
};

beforeEach(() => {
  vi.mocked(supabaseFetch).mockReset();
  req.headers = null;
});

describe("where a Mira visit came from", () => {
  it("keeps a tagged link's source, medium and campaign, cleaned like every utm value", () => {
    expect(
      sourceProps(
        JSON.stringify({
          source: " Instagram\r\n",
          medium: "Paid_Social",
          campaign: "mira<launch>",
          referrer_host: "l.instagram.com",
          fbclid: "abc",
        })
      )
    ).toEqual({ source: "instagram", medium: "paid_social", campaign: "miralaunch" });
  });

  it("keeps the referring site only for an untagged visit, and records a direct one", () => {
    expect(sourceProps(JSON.stringify({ referrer_host: "WWW.ChatGPT.com/<x>" }))).toEqual({
      source: null,
      referrer_host: "www.chatgpt.comx",
    });
    expect(sourceProps("{}")).toEqual({ source: null });
  });

  it("ignores what isn't a source: no value, bad JSON, the wrong shape, too long", () => {
    for (const bad of [null, undefined, "", "not json", "[1]", '{"source":5}', "x".repeat(2001)]) {
      expect(sourceProps(bad)).toBeNull();
    }
  });
});

describe("requestExtras", () => {
  it("marks every event from a team browser, its own cookie or our probes'", async () => {
    for (const cookie of ["loveiq_team=1", "a=b; loveiq_probe=1", "x=1; loveiq_team=1; y=2"]) {
      request({ cookie });
      expect(await requestExtras("message_sent")).toEqual({ team: true });
    }
    for (const cookie of ["loveiq_team=10", "not_loveiq_team=1", "loveiq_team=0", ""]) {
      request({ cookie });
      expect(await requestExtras("message_sent")).toEqual({});
    }
  });

  it("adds where the visit came from to chat_opened, chat_started and signup_completed only", async () => {
    request({ [SOURCE_HEADER]: sent({ source: "newsletter", campaign: "nov" }) });
    for (const name of ["chat_opened", "chat_started", "signup_completed"]) {
      expect(await requestExtras(name)).toEqual({ source: "newsletter", campaign: "nov" });
    }
    for (const name of ["message_sent", "rating", "signup_code_sent"]) {
      expect(await requestExtras(name)).toEqual({});
    }
  });

  it("reads Google sign-in's cookie when no header came, and the header first", async () => {
    request({ cookie: `${SOURCE_COOKIE}=${sent({ source: "tiktok" })}; loveiq_team=1` });
    expect(await requestExtras("signup_completed")).toEqual({ source: "tiktok", team: true });
    request({
      cookie: `${SOURCE_COOKIE}=${sent({ source: "tiktok" })}`,
      [SOURCE_HEADER]: sent({ referrer_host: "google.com" }),
    });
    expect(await requestExtras("signup_completed")).toEqual({
      source: null,
      referrer_host: "google.com",
    });
  });

  it("adds nothing outside a request, or for a header that isn't one", async () => {
    expect(await requestExtras("chat_opened")).toEqual({});
    request({ [SOURCE_HEADER]: "%E0%A4%A" });
    expect(await requestExtras("chat_opened")).toEqual({});
  });
});

describe("the KPI log and the account", () => {
  const written = () =>
    vi
      .mocked(supabaseFetch)
      .mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

  it("writes the request's extras into the event's props", async () => {
    vi.mocked(supabaseFetch).mockResolvedValue(new Response(null, { status: 201 }));
    request({ cookie: "loveiq_team=1", [SOURCE_HEADER]: sent({ source: "instagram" }) });
    logMiraEvent("chat_started", { anonId: "browser-1" }, { signedIn: false, chip: -1 });
    req.headers = null; // the response has gone: what the event keeps was read in the request
    await flushAfterResponse();
    expect(written()).toEqual([
      {
        name: "chat_started",
        anon_id: "browser-1",
        user_id: null,
        props: { signedIn: false, chip: -1, source: "instagram", team: true },
      },
    ]);
  });

  it("makes an account the team's only when it signs in from a team browser", async () => {
    vi.mocked(supabaseFetch).mockImplementation(
      async () => new Response(JSON.stringify([{ id: "u1" }]), { status: 201 })
    );
    request({ cookie: "mira_anon=x" });
    await upsertProfileAtSignIn("u1", "lea@gmail.com", "v1", { useAssessment: false });
    request({ cookie: "mira_anon=x; loveiq_team=1" });
    await upsertProfileAtSignIn("u1", "lea@gmail.com", "v1", { useAssessment: false });
    const [plain, team] = written();
    expect(plain).not.toHaveProperty("is_team");
    expect(team).toMatchObject({ id: "u1", email: "lea@gmail.com", is_team: true });
  });
});
