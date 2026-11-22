import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));
vi.mock("@features/mira/server/store", () => ({
  findAssessment: vi.fn().mockResolvedValue(null),
  logMiraEvent: vi.fn(),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));

import { DELETE, GET, POST } from "@/app/api/mira/checks/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { checksForMira } from "@features/mira/server/checks";
import { isMinor } from "@features/mira/server/minor";
import { personalInstructions } from "@features/mira/server/prompt";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";

/** /api/mira/checks against a small stand-in for the two tables, as PostgREST answers them. */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const LEA = { id: "u1", email: "lea@example.com" };

type Row = { user_id: string; scale: string; answers: number[]; created_at: string };
let db: {
  user: {
    name: string | null;
    use_checks: boolean;
    use_assessment: boolean;
    country: string | null;
  };
  checks: Row[];
  body: Array<{ score: number; created_at: string }>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
  vi.mocked(verifyCsrfToken).mockResolvedValue(true);
  vi.mocked(isMinor).mockResolvedValue(false);
  db = {
    user: { name: "Lea", use_checks: false, use_assessment: false, country: "DE" },
    checks: [],
    body: [],
  };
  vi.mocked(supabaseFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const mine = db.checks.filter((r) => r.user_id === "u1");
    if (method === "GET" && path.startsWith("/rest/v1/mira_user?id=eq.u1&select=")) {
      return json([
        {
          ...db.user,
          mira_check: [...mine].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        },
      ]);
    }
    if (method === "GET" && path.startsWith("/rest/v1/mira_user?id=eq.u1&use_checks=is.true")) {
      const since = decodeURIComponent(path.match(/created_at=gte\.([^&]+)/)![1]!);
      const recent = mine
        .filter((r) => r.created_at >= since)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return json(db.user.use_checks ? [{ mira_check: recent }] : []);
    }
    if (method === "GET" && path.startsWith("/rest/v1/mira_check?user_id=eq.u1&scale=eq.")) {
      const scale = path.match(/scale=eq\.(\w+)/)![1];
      const latest = mine
        .filter((r) => r.scale === scale)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return json(latest.slice(0, 1));
    }
    if (method === "POST" && path === "/rest/v1/mira_check?select=created_at") {
      const row = { ...JSON.parse(String(init!.body)), created_at: new Date().toISOString() };
      // The unique index: one per person, scale and UTC day.
      if (
        mine.some(
          (r) => r.scale === row.scale && r.created_at.slice(0, 10) === row.created_at.slice(0, 10)
        )
      ) {
        return json({ code: "23505" }, 409);
      }
      db.checks.push(row);
      return json([{ created_at: row.created_at }], 201);
    }
    if (method === "DELETE" && path === "/rest/v1/mira_check?user_id=eq.u1") {
      db.checks = db.checks.filter((r) => r.user_id !== "u1");
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && path.startsWith("/rest/v1/mira_body_check?user_id=eq.u1")) {
      return json(db.body);
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  });
});

const call = (
  handler: (r: Request) => Promise<Response>,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
) =>
  handler(
    new Request("http://localhost/api/mira/checks", {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
const save = (check: string, answers: unknown, extra: Record<string, unknown> = {}) =>
  call(POST, "POST", { check, answers, ...extra });
const GAD = [2, 2, 2, 2, 1, 1, 0]; // 10: moderate
const PHQ = (item9: number) => [0, 0, 0, 0, 0, 0, 0, 0, item9];
const someone = (scale: string, answers: number[], created_at: string, user_id = "u1") =>
  db.checks.push({ user_id, scale, answers, created_at });
const events = () => vi.mocked(logMiraEvent).mock.calls;

describe("every method", () => {
  it("needs a signed-in person, the CSRF token on writes, and refuses someone stopped as under 18", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    for (const [h, m] of [
      [GET, "GET"],
      [POST, "POST"],
      [DELETE, "DELETE"],
    ] as const) {
      expect((await call(h, m, m === "GET" ? undefined : {})).status, m).toBe(401);
    }
    vi.mocked(getMiraAccount).mockResolvedValue(LEA);
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);
    expect((await save("anxiety", GAD)).status).toBe(403);
    expect((await call(DELETE, "DELETE")).status).toBe(403);
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(isMinor).mockResolvedValue(true);
    for (const [h, m] of [
      [GET, "GET"],
      [POST, "POST"],
      [DELETE, "DELETE"],
    ] as const) {
      const res = await call(h, m, m === "POST" ? { check: "anxiety", answers: GAD } : undefined);
      expect(res.status, m).toBe(403);
      expect(await res.json()).toEqual({ error: "Mira is only for adults." });
    }
    expect(isMinor).toHaveBeenCalledWith("u1");
    expect(db.checks).toEqual([]);
  });
});

describe("POST: a finished check", () => {
  it("is scored on the server from the answers alone, whatever score the browser claims", async () => {
    const res = await save("anxiety", GAD, { score: 0, band: "minimal" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toMatchObject({ score: 10, band: "moderate", support: false });
    expect(body.previous).toBeNull();
    // Stored as given, by the account's id, without any score.
    expect(db.checks).toEqual([
      { user_id: "u1", scale: "gad7", answers: GAD, created_at: expect.any(String) },
    ]);
  });

  it("takes one answer per question in the scale's own values only", async () => {
    for (const [check, answers] of [
      ["anxiety", GAD.slice(1)],
      ["anxiety", [...GAD, 0]],
      ["anxiety", [4, 0, 0, 0, 0, 0, 0]],
      ["anxiety", [1.5, 0, 0, 0, 0, 0, 0]],
      ["loneliness", [0, 1, 1]], // the loneliness scale runs 1 to 3
      ["body", GAD],
      ["anxiety", "0,0,0"],
    ] as const) {
      expect((await save(check, answers)).status, `${check} ${JSON.stringify(answers)}`).toBe(400);
    }
    expect(db.checks).toEqual([]);
  });

  it("logs which check and whether it was a retake, never answers, scores or bands", async () => {
    await save("anxiety", GAD);
    someone("ucla3", [1, 1, 1], ago(30));
    await save("loneliness", [3, 3, 3]);
    expect(events()).toEqual([
      ["anxiety_check_done", { userId: "u1" }, { scale: "gad7", retake: false }],
      ["loneliness_check_done", { userId: "u1" }, { scale: "ucla3", retake: true }],
    ]);
  });

  it("opens a retake 14 days after an anxiety or mood check and 28 after a loneliness check", async () => {
    someone("gad7", GAD, ago(13));
    const early = await save("anxiety", GAD);
    expect(early.status).toBe(409);
    expect((await early.json()).nextAt).toBe(
      new Date(Date.parse(db.checks[0]!.created_at) + 14 * DAY).toISOString()
    );
    db.checks = [];
    someone("gad7", [3, 3, 3, 3, 3, 3, 3], ago(14));
    const retake = await (await save("anxiety", GAD)).json();
    expect(retake.previous).toMatchObject({ score: 21 });
    expect(retake.result).toMatchObject({ score: 10, band: "moderate" });
    someone("ucla3", [2, 2, 2], ago(27));
    expect((await save("loneliness", [1, 1, 1])).status).toBe(409);
    expect(db.checks.filter((r) => r.scale === "ucla3")).toHaveLength(1);
  });

  it("keeps a double submit from storing two results on one day", async () => {
    // Two requests that both read "no result yet" before either was stored.
    const first = save("mood", PHQ(0));
    const second = save("mood", PHQ(0));
    const statuses = (await Promise.all([first, second])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(db.checks).toHaveLength(1);
  });

  it("says when the mood check's question 9 needs the support lines, whatever the total", async () => {
    const low = await (await save("mood", PHQ(1))).json();
    expect(low.result).toMatchObject({ score: 1, band: "minimal", support: true });
    db.checks = [];
    const none = await (await save("mood", [3, 3, 3, 3, 3, 3, 3, 3, 0])).json();
    expect(none.result).toMatchObject({ score: 24, band: "severe", support: false });
  });

  it("answers with an error when the result could not be stored", async () => {
    vi.mocked(supabaseFetch).mockResolvedValue(json({}, 500));
    const res = await save("anxiety", GAD);
    expect(res.status).toBe(500);
    expect(events()).toEqual([]);
  });
});

describe("GET: the person's checks", () => {
  it("scores every result on the server and says when each check opens again", async () => {
    someone("gad7", [3, 3, 3, 3, 3, 3, 3], ago(30));
    someone("gad7", GAD, ago(3));
    someone("ucla3", [1, 1, 2], ago(40));
    someone("phq9", PHQ(3), ago(1), "someone-else");
    db.body = [{ score: 3.7, created_at: ago(10) }];
    db.user.use_checks = true;
    const body = await (await call(GET, "GET")).json();
    expect(body).toMatchObject({ email: "lea@example.com", name: "Lea", useChecks: true });
    expect(body.support).toBe("DE");
    const [anxiety, mood, loneliness] = body.checks;
    expect(anxiety.results.map((r: { score: number; band: string }) => [r.score, r.band])).toEqual([
      [21, "severe"],
      [10, "moderate"],
    ]);
    expect(Date.parse(anxiety.nextAt)).toBeGreaterThan(Date.now() + 10 * DAY);
    expect(mood).toEqual({ id: "mood", results: [], nextAt: null }); // never another's result
    expect(loneliness.results).toMatchObject([{ score: 4, band: "low" }]);
    expect(loneliness.nextAt).toBeNull(); // 40 days on: open again
    expect(body.bodyCheck).toEqual({
      taken: [db.body[0]!.created_at],
      due: null,
      nextAt: new Date(Date.parse(db.body[0]!.created_at) + 28 * DAY).toISOString(),
    });
    // The answers themselves never leave the server.
    expect(JSON.stringify(body)).not.toContain("answers");
  });

  it("keeps question 9's support with its result on every later read, whatever the total", async () => {
    someone("phq9", PHQ(0), ago(30));
    someone("phq9", PHQ(3), ago(2));
    someone("gad7", GAD, ago(2));
    const body = await (await call(GET, "GET")).json();
    const [anxiety, mood] = body.checks;
    expect(mood.results).toEqual([
      { at: db.checks[0]!.created_at, score: 0, band: "minimal", support: false },
      { at: db.checks[1]!.created_at, score: 3, band: "minimal", support: true },
    ]);
    expect(anxiety.results).toMatchObject([{ score: 10, support: false }]);
    expect(JSON.stringify(body)).not.toContain("answers");
  });

  it("shows the visitor's country's support lines when the account has none", async () => {
    db.user.country = null;
    const body = await (await call(GET, "GET", undefined, { "x-vercel-ip-country": "GB" })).json();
    expect(body.support).toBe("GB");
  });
});

describe("DELETE", () => {
  it("deletes every result of the account and no one else's", async () => {
    someone("gad7", GAD, ago(3));
    someone("gad7", GAD, ago(3), "someone-else");
    expect((await call(DELETE, "DELETE")).status).toBe(200);
    expect(db.checks.map((r) => r.user_id)).toEqual(["someone-else"]);
    expect(events()).toEqual([["checks_deleted", { userId: "u1" }]]);
  });
});

describe("what Mira may use", () => {
  it("is nothing while 'Mira may use my check results' is off, and the switch is read in the query", async () => {
    someone("gad7", GAD, ago(2));
    expect(await checksForMira("u1")).toEqual([]);
    expect(String(vi.mocked(supabaseFetch).mock.calls[0]![0])).toContain(
      "mira_user?id=eq.u1&use_checks=is.true&"
    );
  });

  it("is each check's latest band from the last 90 days, never answers or scores", async () => {
    db.user.use_checks = true;
    someone("gad7", [3, 3, 3, 3, 3, 3, 3], ago(20));
    someone("gad7", GAD, ago(2));
    someone("phq9", PHQ(2), ago(0));
    someone("ucla3", [3, 3, 3], ago(120)); // too old to describe them now
    const checks = await checksForMira("u1");
    expect(checks).toEqual([
      {
        title: "Mood check",
        name: "PHQ-9",
        band: "minimal symptoms of depression",
        daysAgo: 0,
        support: true,
      },
      {
        title: "Anxiety check",
        name: "GAD-7",
        band: "moderate anxiety",
        daysAgo: 2,
        support: false,
      },
    ]);
    const text = personalInstructions({}, { signedIn: true, checks });
    expect(text).toContain("- Anxiety check (GAD-7), 2 days ago: moderate anxiety.");
    expect(text).toMatch(/Never diagnose/);
    expect(text).not.toMatch(/Loneliness|\b10\b|answers? (were|was)/);
    expect(personalInstructions({}, { signedIn: true, checks: [] })).not.toContain("Self-checks");
  });

  it("never calls a check with question 9 above 'Not at all' minimal alone: it is rail 14", async () => {
    db.user.use_checks = true;
    someone("phq9", PHQ(1), ago(3));
    const text = personalInstructions({}, { signedIn: true, checks: await checksForMira("u1") });
    expect(text).toContain(
      "- Mood check (PHQ-9), 3 days ago: minimal symptoms of depression, and in that same check they said they have had thoughts of being better off dead or of hurting themselves (question 9)."
    );
    expect(text).not.toContain("minimal symptoms of depression.");
    expect(text).toContain(
      "Thoughts of being better off dead or of hurting themselves in a check are rail 14 whatever its band: follow your crisis rules, and never call that check minimal or reassure them about it."
    );
    // Without that answer, no such line.
    db.checks = [];
    someone("phq9", PHQ(0), ago(3));
    const calm = personalInstructions({}, { signedIn: true, checks: await checksForMira("u1") });
    expect(calm).toContain("- Mood check (PHQ-9), 3 days ago: minimal symptoms of depression.");
    expect(calm).not.toMatch(/rail 14|better off dead/);
  });
});

describe("a 'yes' to the mood check's question 9", () => {
  it("is never forgotten once the save's response is gone: later reads and Mira's context keep it", async () => {
    db.user.use_checks = true;
    const saved = await (await save("mood", [0, 0, 0, 0, 0, 0, 0, 0, 3])).json();
    expect(saved.result).toMatchObject({ score: 3, band: "minimal", support: true });
    // A reload, Home's link, another device: the result still carries it.
    const later = await (await call(GET, "GET")).json();
    expect(later.checks[1].results).toEqual([
      { at: saved.result.at, score: 3, band: "minimal", support: true },
    ]);
    const forMira = await checksForMira("u1");
    expect(forMira).toEqual([
      {
        title: "Mood check",
        name: "PHQ-9",
        band: "minimal symptoms of depression",
        daysAgo: 0,
        support: true,
      },
    ]);
    expect(personalInstructions({}, { signedIn: true, checks: forMira })).toMatch(
      /today: minimal symptoms of depression, and in that same check they said they have had thoughts of being better off dead/
    );
  });
});
