import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: vi.fn(),
  createMiraSupabase: vi.fn(),
}));
vi.mock("@features/mira/server/nudges", () => ({ isValidTimeZone: () => true }));
vi.mock("@features/mira/server/store", () => ({
  findAssessment: vi.fn().mockResolvedValue(null),
  getProfile: vi.fn(),
  listChats: vi.fn().mockResolvedValue([]),
  logMiraEvent: vi.fn(),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));

import miraConfig from "@features/mira/content/mira-config.json";
import { POST } from "@/app/api/mira/body-check/route";
import { GET } from "@/app/api/mira/me/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { FOLLOW_UP_DAYS, bodyCheckDue } from "@features/mira/server/body-check";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";

const DAY = 24 * 60 * 60 * 1000;
const LEA = { id: "u1", email: "lea@example.com" };
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/mira/body-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
const TEN = [4, 4, 5, 3, 4, 3, 4, 3, 4, 3];

/** The table as PostgREST shows it: GET lists the checks, POST adds one. */
function table(taken: string[], insert = 201) {
  vi.mocked(supabaseFetch).mockImplementation(async (_path, init) =>
    init?.method === "POST"
      ? new Response(null, { status: insert })
      : json(taken.map((created_at) => ({ score: 3.7, created_at })))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
});

describe("bodyCheckDue", () => {
  const now = new Date("2026-12-20T10:00:00Z");
  it("asks for the baseline first, then once more from four weeks on, then never", () => {
    expect(bodyCheckDue([], now)).toBe("baseline");
    const day = (n: number) => new Date(now.getTime() - n * DAY).toISOString();
    expect(bodyCheckDue([day(FOLLOW_UP_DAYS - 1)], now)).toBeNull();
    expect(bodyCheckDue([day(FOLLOW_UP_DAYS)], now)).toBe("week4");
    expect(bodyCheckDue([day(60), day(30)], now)).toBeNull();
  });
});

describe("the body check's statements", () => {
  it("are the Body Appreciation Scale-2's ten, unchanged, on its 5-point scale", () => {
    const { items, answers, directions } = miraConfig.bodyCheck;
    expect(items).toHaveLength(10);
    expect(items[0]).toBe("I respect my body.");
    // The authors' recommended Item 8 (Study 3), inclusive of physical ability.
    expect(items[7]).toBe(
      "My behavior reveals my positive attitude toward my body; for example, I hold my head high and smile."
    );
    expect(answers).toEqual(["Never", "Seldom", "Sometimes", "Often", "Always"]);
    expect(directions).toBe(
      "Please indicate whether the question is true about you never, seldom, sometimes, often, or always."
    );
  });
});

describe("POST /api/mira/body-check", () => {
  it("refuses an account stopped as under 18 and stores nothing, as the other self-checks", async () => {
    vi.mocked(isMinor).mockResolvedValueOnce(true);
    const res = await post({ answers: Array(10).fill(3) });
    expect(res.status).toBe(403);
    expect(vi.mocked(supabaseFetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false
    );
  });

  it("needs the CSRF token and a signed-in person", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await post({ answers: TEN })).status).toBe(403);
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await post({ answers: TEN })).status).toBe(401);
    expect(supabaseFetch).not.toHaveBeenCalled();
  });

  it("takes exactly ten whole answers from 1 to 5", async () => {
    table([]);
    for (const answers of [
      TEN.slice(1),
      [...TEN, 3],
      [0, ...TEN.slice(1)],
      [6, ...TEN.slice(1)],
      [3.5, ...TEN.slice(1)],
    ]) {
      expect((await post({ answers })).status, JSON.stringify(answers)).toBe(400);
    }
    expect(vi.mocked(supabaseFetch).mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });

  it("saves the baseline with the answers as given and logs it as week 0", async () => {
    table([]);
    const res = await post({ answers: TEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, week: 0 });
    const insert = vi.mocked(supabaseFetch).mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(insert[0]).toBe("/rest/v1/mira_body_check");
    expect(JSON.parse(String(insert[1]!.body))).toEqual({ user_id: "u1", answers: TEN });
    expect(logMiraEvent).toHaveBeenCalledWith("body_check_done", { userId: "u1" }, { week: 0 });
  });

  it("saves the four-week check only from four weeks after the first", async () => {
    table([ago(FOLLOW_UP_DAYS - 1)]);
    expect((await post({ answers: TEN })).status).toBe(409);
    table([ago(FOLLOW_UP_DAYS + 1)]);
    const res = await post({ answers: TEN });
    expect(await res.json()).toEqual({ success: true, week: 4 });
    table([ago(60), ago(30)]);
    expect((await post({ answers: TEN })).status).toBe(409);
  });

  it("says so when the answers could not be saved", async () => {
    table([], 500);
    const res = await post({ answers: TEN });
    expect(res.status).toBe(500);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});

describe("GET /api/mira/me", () => {
  it("says which body check is due, and offers none when the checks can't be read", async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: "u1", email: LEA.email } as never);
    table([]);
    const get = () => GET(new Request("http://localhost/api/mira/me"));
    expect((await (await get()).json()).bodyCheck).toEqual({ due: "baseline" });
    vi.mocked(supabaseFetch).mockResolvedValue(new Response(null, { status: 500 }));
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).bodyCheck).toEqual({ due: null });
  });
});
