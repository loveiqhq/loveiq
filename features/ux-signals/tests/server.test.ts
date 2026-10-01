import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionQuery = vi.hoisted(() => vi.fn());
vi.mock("@features/ux-review/server/review", () => ({ sessionQuery }));
const supabaseFetch = vi.hoisted(() => vi.fn());
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SIGNAL_EVENTS, SIGNAL_PROPS } from "@features/ux-signals/logic/signals";
import {
  fetchVisits,
  ROW_CAP,
  toVisits,
  windowQuery,
} from "@features/ux-signals/server/posthog-visits";
import { buildUxSignalsReport, renderUxSignals } from "@features/ux-signals/server/report";
import { readWalkRecords } from "@features/ux-signals/server/walks";

/** A PostHog row: session, ms, event, then SIGNAL_PROPS in order. */
const row = (sid: string, t: number, event: string, props: Record<string, unknown> = {}) => [
  sid,
  t,
  event,
  ...SIGNAL_PROPS.map((p) => props[p] ?? null),
];

beforeEach(() => {
  sessionQuery.mockReset();
  supabaseFetch.mockReset();
  vi.stubEnv("POSTHOG_API_KEY", "phx_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("the PostHog read", () => {
  it("asks for production only, the signals' events only, and states its limit", () => {
    const q = windowQuery(7, 0);
    expect(q).toContain("properties.deploy_env = 'production'");
    for (const e of SIGNAL_EVENTS) expect(q).toContain(`'${e}'`);
    for (const p of SIGNAL_PROPS) expect(q).toContain(`properties.${p}`);
    expect(q).toMatch(new RegExp(`LIMIT ${ROW_CAP}$`));
    // `!=` would let a NULL session through as a visit of its own.
    expect(q).toContain("notEmpty(toString($session_id))");
    expect(q).toContain("INTERVAL 7 DAY");
    expect(q).toContain("INTERVAL 0 DAY");
  });

  it("groups rows into visits in time order, dropping empty properties", () => {
    const visits = toVisits([
      row("s1", 20, "survey_answer", { question_id: "01002" }),
      row("s2", 5, "report_viewed"),
      row("s1", 10, "survey_started", { pathname: "" }),
      ["not a session", "x", 1],
    ]);
    expect([...visits.keys()]).toEqual(["s1", "s2"]);
    expect(visits.get("s1")).toEqual([
      { t: 10, event: "survey_started", props: {} },
      { t: 20, event: "survey_answer", props: { question_id: "01002" } },
    ]);
  });

  it("reads a week at a time, and a full week again a day at a time", async () => {
    const full = Array.from({ length: ROW_CAP }, (_, i) => row("s", i, "survey_answer"));
    sessionQuery.mockImplementation(async (q: string) => {
      if (q.includes("INTERVAL 14 DAY") && q.includes("INTERVAL 7 DAY")) return full;
      return [row(`s-${q.length}`, 1, "report_viewed")];
    });
    const r = await fetchVisits(14);
    expect(r.ok).toBe(true);
    // One read for the full week, seven for its days, one for the other week.
    expect(sessionQuery).toHaveBeenCalledTimes(9);
    expect(r.ok && r.events).toBe(8);
  });

  it("fails whole, never in part: a day it cannot read, or one too big to read", async () => {
    sessionQuery.mockResolvedValueOnce([row("s", 1, "report_viewed")]).mockResolvedValueOnce(null);
    expect(await fetchVisits(14)).toEqual({ ok: false, why: "PostHog did not answer" });
    const full = Array.from({ length: ROW_CAP }, (_, i) => row("s", i, "survey_answer"));
    sessionQuery.mockReset().mockResolvedValue(full);
    const r = await fetchVisits(7);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toMatch(/more events than one read returns/);
  });

  it("says so when it has no key, rather than reporting no visits", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "");
    expect(await fetchVisits(7)).toEqual({ ok: false, why: "POSTHOG_API_KEY is not set" });
    expect(sessionQuery).not.toHaveBeenCalled();
  });
});

describe("the walk records", () => {
  it("reads four weeks, newest first, and refuses a read that may be cut short", async () => {
    supabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ walk: "w1", walked_at: "2026-10-01T02:50:00Z", events: [], truth: {} }],
    });
    const rows = await readWalkRecords(new Date("2026-10-01T12:00:00Z"));
    expect(rows).toEqual([{ walk: "w1", walkedAt: "2026-10-01T02:50:00Z", events: [], truth: {} }]);
    const url = String(supabaseFetch.mock.calls[0]![0]);
    expect(url).toContain("walked_at=gte.2026-09-03T12%3A00%3A00.000Z");
    expect(url).toContain("order=walked_at.desc");

    supabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => Array.from({ length: 1000 }, () => ({ walk: "w", walked_at: "x" })),
    });
    expect(await readWalkRecords()).toBeNull();
    supabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await readWalkRecords()).toBeNull();
  });
});

describe("the report", () => {
  const backtrackWalk = (n: number, back: boolean) => ({
    walk: `w${n}`,
    walked_at: "2026-10-01T02:50:00Z",
    events: (back ? [1, 2, 2, 3] : [1, 2, 3]).map((i, k) => ({
      t: k,
      event: "survey_progress",
      props: { question_index: i },
    })),
    truth: { Backtracking: back ? 1 : 0 },
  });

  it("shows a proven signal's number and only that one's", async () => {
    supabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        ...Array.from({ length: 5 }, (_, i) => backtrackWalk(i, true)),
        ...Array.from({ length: 6 }, (_, i) => backtrackWalk(10 + i, false)),
      ],
    });
    sessionQuery.mockResolvedValue([
      row("v1", 1, "survey_progress", { question_index: 1 }),
      row("v1", 2, "survey_progress", { question_index: 1 }),
      row("v2", 1, "survey_progress", { question_index: 1 }),
      row("v2", 2, "rage_click", { target_selector: "button.next" }),
    ]);
    const r = await buildUxSignalsReport(7);
    const back = r.signals.find((s) => s.name === "Backtracking")!;
    expect(back.proof.proven).toBe(true);
    expect(back.finding).toBe("50% of 2 visits, at least once (1); most often at question 1.");
    const rage = r.signals.find((s) => s.name === "Rage clicks / repeated taps")!;
    expect(rage.proof.proven).toBe(false);
    expect(rage.finding).toBeNull();
    const text = renderUxSignals(r);
    expect(text).toContain("PROVEN, AND WHAT REAL VISITS SHOW (1 of 22)");
    expect(text).toContain("- Backtracking (Survey): 50% of 2 visits");
    // The unproven rage count never reaches the text.
    expect(text).not.toMatch(/Rage clicks[^\n]*of 2 visits/);
  });

  it("proves nothing and shows nothing when the walk records cannot be read", async () => {
    supabaseFetch.mockResolvedValue({ ok: false, status: 503 });
    sessionQuery.mockResolvedValue([row("v1", 1, "survey_progress", { question_index: 1 })]);
    const r = await buildUxSignalsReport(7);
    expect(r.walks).toBeNull();
    expect(r.signals.every((s) => !s.proof.proven && s.finding === null)).toBe(true);
    expect(renderUxSignals(r)).toContain("the walk records could not be read");
  });

  it("says PostHog was down rather than showing an empty week", async () => {
    supabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    sessionQuery.mockResolvedValue(null);
    const text = renderUxSignals(await buildUxSignalsReport(7));
    expect(text).toContain("PostHog could not be read (PostHog did not answer)");
    expect(text).toContain("This is an outage, not a result");
  });
});
