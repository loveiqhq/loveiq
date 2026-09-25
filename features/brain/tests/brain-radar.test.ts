import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * An in-memory stand-in for the three tables the radar touches, answering the exact
 * PostgREST paths it sends, so a run, a sync and a settle are tested end to end.
 */
interface Row {
  id: number;
  source_id: string;
  title: string;
  body: string;
  period_end: string;
  meta: Record<string, unknown>;
}
const db = {
  chunks: [] as Row[],
  conflicts: [] as Array<Record<string, unknown>>,
  topics: new Map<string, string>(),
  failGet: null as string | null,
  failWrite: null as string | null,
};
const param = (url: URL, key: string) => decodeURIComponent(url.searchParams.get(key) ?? "");
const eq = (url: URL, key: string) => param(url, key).replace(/^eq\./, "");
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const mockSupabaseFetch = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  const url = new URL(`http://x${path}`);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body) : null;
  const table = url.pathname.replace("/rest/v1/", "");
  if (method === "GET" && db.failGet && table === db.failGet)
    return { ok: false, status: 503, json: async () => ({}) };
  if (method !== "GET" && db.failWrite && table === db.failWrite)
    return { ok: false, status: 500, json: async () => ({}) };
  if (method === "GET" && Number(url.searchParams.get("offset") ?? 0) > 0) return ok([]);
  if (table === "brain_chunk" && method === "GET") {
    const id = eq(url, "source_id");
    return ok(id ? db.chunks.filter((c) => c.source_id === id) : db.chunks);
  }
  if (table === "brain_chunk" && method === "PATCH") {
    const byId = eq(url, "id");
    const bySource = eq(url, "source_id");
    for (const c of db.chunks) {
      if ((byId && String(c.id) === byId) || (bySource && c.source_id === bySource))
        c.meta = body.meta;
    }
    return ok({});
  }
  if (table === "brain_decision_conflict" && method === "GET") {
    const or = param(url, "or");
    if (!or) return ok(db.conflicts);
    const ids = [...or.matchAll(/earlier\.eq\.([^,)]+),later\.eq\.([^,)]+)/g)].map((m) => [
      m[1],
      m[2],
    ]);
    return ok(db.conflicts.filter((c) => ids.some(([e, l]) => c.earlier === e && c.later === l)));
  }
  if (table === "brain_decision_conflict" && method === "PATCH") {
    for (const c of db.conflicts) {
      if (c.earlier === eq(url, "earlier") && c.later === eq(url, "later")) Object.assign(c, body);
    }
    return ok({});
  }
  if (table === "brain_decision_conflict" && method === "POST") {
    for (const f of body as Array<Record<string, unknown>>) {
      if (!db.conflicts.some((c) => c.earlier === f.earlier && c.later === f.later)) {
        db.conflicts.push({ status: "open", settled_by: null, settled_on: null, note: null, ...f });
      }
    }
    return ok({});
  }
  if (table === "brain_radar_topic" && method === "GET") {
    return ok([...db.topics].map(([topic, ids_hash]) => ({ topic, ids_hash })));
  }
  if (table === "brain_radar_topic" && method === "POST") {
    db.topics.set(body.topic, body.ids_hash);
    return ok({});
  }
  throw new Error(`unexpected ${method} ${path}`);
});
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [string])),
}));

import {
  checkTopic,
  decisionId,
  disputeMarks,
  GEN,
  idsHash,
  MAX_CANDIDATES,
  openConflicts,
  orderPair,
  parseCandidates,
  parseJson,
  parseVerdict,
  renderConflicts,
  runRadar,
  settleConflict,
  syncDisputes,
  toDecision,
  VERIFY,
  type ConflictRow,
  type Decision,
  type RadarDeps,
} from "@features/brain/server/radar";

const NOW = Date.parse("2026-09-26T09:00:00Z");
let nextId = 1;
const chunk = (
  sourceId: string,
  day: string,
  decision: string,
  topic: string,
  extra: Record<string, unknown> = {}
): Row => ({
  id: nextId++,
  source_id: sourceId,
  title: `Decision: ${decision}`,
  body: `Decided on ${day} by meeting notes.\nTopic: ${topic}\n\n${decision}\n\nWhy: because ${decision.toLowerCase()}\n\nQuoted from the notes: "${decision}"`,
  period_end: day,
  meta: { kind: "decision", topic, ...extra },
});
const JIRA = "decision:2026-05-15-jira";
const NOTION = "decision:2026-09-03-notion";
const FIGMA = "decision:2026-05-25-figma";

beforeEach(() => {
  db.chunks = [
    chunk(JIRA, "2026-05-15", "Require Jira tickets for all features", "tooling"),
    chunk(NOTION, "2026-09-03", "Shift from Notion to a ticket system for bugs", "tooling"),
    chunk(FIGMA, "2026-05-25", "Adopt Figma as the design tool", "tooling"),
    chunk("decision:2026-04-01-alone", "2026-04-01", "Keep one shared credential", "brain"),
  ];
  db.conflicts = [];
  db.topics = new Map();
  db.failGet = null;
  db.failWrite = null;
  mockSupabaseFetch.mockClear();
});

describe("reading the model's answers", () => {
  it("takes JSON out of a fenced answer, and gives up on anything else", () => {
    expect(parseJson('```json\n{"pairs":[]}\n```')).toEqual({ pairs: [] });
    // Seen live: a JavaScript expression inside the JSON.
    expect(parseJson('{"pairs":[{"a":"x".replace("1","2")}]}')).toBeNull();
    expect(parseJson("no json here")).toBeNull();
  });

  it("keeps candidate pairs from this topic's list only, once each, prefix or not", () => {
    const ids = new Set([JIRA, NOTION, FIGMA]);
    const out = parseCandidates(
      JSON.stringify({
        pairs: [
          { a: "2026-05-15-jira", b: "2026-09-03-notion" },
          { a: NOTION, b: JIRA }, // the same pair again, reversed
          { a: JIRA, b: JIRA }, // itself
          { a: JIRA, b: "decision:2026-01-01-invented" },
          { a: 3, b: FIGMA },
          { a: "decision/2026-05-25-figma", b: JIRA },
        ],
      }),
      ids
    );
    expect(out).toEqual([
      [JIRA, NOTION],
      [FIGMA, JIRA],
    ]);
    expect(parseCandidates("nothing", ids)).toBeNull();
    expect(parseCandidates('{"pairs":"x"}', ids)).toBeNull();
  });

  it("stops at the candidate cap", () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => `decision:d${i}`));
    const pairs = Array.from({ length: 29 }, (_, i) => ({ a: `d${i}`, b: `d${i + 1}` }));
    expect(parseCandidates(JSON.stringify({ pairs }), ids)).toHaveLength(MAX_CANDIDATES);
  });

  it("reads a verdict, and never keeps a finding without a reason", () => {
    expect(parseVerdict('{"verdict":"unclear","why":"  two\\n tools "}')).toEqual({
      verdict: "unclear",
      why: "two tools",
    });
    expect(parseVerdict('{"verdict":"none"}')).toEqual({ verdict: "none", why: "" });
    expect(parseVerdict('{"verdict":"reverses","why":""}')).toEqual({ verdict: "none", why: "" });
    expect(parseVerdict('{"verdict":"maybe","why":"x"}')).toBeNull();
    expect(parseVerdict("garbage")).toBeNull();
  });
});

describe("pairs and topics", () => {
  const d = (id: string, day: string) => toDecision(chunk(id, day, `D ${id}`, "t"));

  it("orders a pair by the day it was decided, then by id, whatever the model said", () => {
    const [early, late] = orderPair(d("decision:b", "2026-09-01"), d("decision:a", "2026-05-01"));
    expect([early.id, late.id]).toEqual(["decision:a", "decision:b"]);
    const [x, y] = orderPair(d("decision:z", "2026-05-01"), d("decision:y", "2026-05-01"));
    expect([x.id, y.id]).toEqual(["decision:y", "decision:z"]);
  });

  it("hashes a topic by its decision ids, in any order, and changes when one comes or goes", () => {
    const a = d("decision:a", "2026-01-01");
    const b = d("decision:b", "2026-01-02");
    expect(idsHash([a, b])).toBe(idsHash([b, a]));
    expect(idsHash([a])).not.toBe(idsHash([a, b]));
  });

  it("reads a decision's reason and evidence, and files an untopic'd one under other", () => {
    const decision = toDecision({
      ...chunk(JIRA, "2026-05-15", "Require Jira", "Tooling"),
      meta: {},
    });
    expect(decision.topic).toBe("other");
    expect(toDecision(chunk(JIRA, "2026-05-15", "Require Jira", "Tooling")).topic).toBe("tooling");
    expect(decision.why).toBe("because require jira");
    expect(decision.detail).toContain('Quoted from the notes: "Require Jira"');
    expect(decisionId("decision/2026-05-15-jira")).toBe(JIRA);
  });
});

const decisionsOf = (topic: string): Decision[] =>
  db.chunks.filter((c) => c.meta.topic === topic).map(toDecision);

/** A model that proposes Jira/Notion, then judges each pair by the given verdicts. */
const model = (
  verdicts: Record<string, string>,
  pairs = [{ a: "2026-09-03-notion", b: "2026-05-15-jira" }]
): RadarDeps => ({
  now: () => NOW,
  complete: vi.fn(async (messages) => {
    const system = String(messages[0]!.content);
    if (system === GEN) return { ok: true as const, text: JSON.stringify({ pairs }) };
    const user = String(messages[1]!.content);
    const key = Object.keys(verdicts).find((k) => user.includes(k)) ?? "";
    return { ok: true as const, text: verdicts[key] ?? '{"verdict":"none","why":""}' };
  }),
});

describe("checkTopic", () => {
  it("proposes, then judges each pair on its own, oldest first, with both records' reasons", async () => {
    const deps = model({
      Jira: '{"verdict":"unclear","why":"Two tools named for tracking work."}',
    });
    const r = await checkTopic("tooling", decisionsOf("tooling"), new Set(), deps);
    expect(r).toEqual({
      ok: true,
      candidates: 1,
      unreadable: 0,
      findings: [
        {
          earlier: JIRA,
          later: NOTION,
          topic: "tooling",
          kind: "unclear",
          why: "Two tools named for tracking work.",
        },
      ],
    });
    const verify = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[1]![0];
    expect(verify[0].content).toBe(VERIFY);
    expect(verify[1].content).toMatch(
      /^Earlier \(2026-05-15\): Require Jira tickets for all features\n {2}Why: because/
    );
    expect(verify[1].content).toContain("Later (2026-09-03): Shift from Notion");
    const gen = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(gen[1].content).toContain(
      "2026-05-15-jira | 2026-05-15 | Require Jira tickets for all features | why: because"
    );
  });

  it("does not judge a pair already on record, and keeps only what the second call confirms", async () => {
    const deps = model({ Jira: '{"verdict":"none","why":""}' });
    const skipped = await checkTopic(
      "tooling",
      decisionsOf("tooling"),
      new Set([[JIRA, NOTION].sort().join("|")]),
      deps
    );
    expect(skipped).toMatchObject({ ok: true, findings: [] });
    expect(deps.complete).toHaveBeenCalledTimes(1);
    const cleared = await checkTopic("tooling", decisionsOf("tooling"), new Set(), deps);
    expect(cleared).toMatchObject({ ok: true, candidates: 1, findings: [] });
  });

  it("fails the topic on a model failure or an unreadable proposal, and skips an unreadable verdict", async () => {
    const down: RadarDeps = {
      now: () => NOW,
      complete: vi.fn(async () => ({ ok: false as const, reason: "rate_limited" as const })),
    };
    expect(await checkTopic("tooling", decisionsOf("tooling"), new Set(), down)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    const junk: RadarDeps = {
      now: () => NOW,
      complete: vi.fn(async () => ({ ok: true as const, text: "no json" })),
    };
    expect(await checkTopic("tooling", decisionsOf("tooling"), new Set(), junk)).toEqual({
      ok: false,
      reason: "unparseable",
    });
    const garbled = model({ Jira: "not json at all" });
    expect(await checkTopic("tooling", decisionsOf("tooling"), new Set(), garbled)).toMatchObject({
      ok: true,
      findings: [],
      unreadable: 1,
    });
  });
});

describe("runRadar", () => {
  const found = '{"verdict":"unclear","why":"Two tools named for tracking work."}';

  it("records a finding, marks both records, and remembers the topic", async () => {
    const r = await runRadar(model({ Jira: found }), 60_000);
    expect(r).toMatchObject({
      ok: true,
      decisions: 4,
      topics: 2,
      checked: ["brain", "tooling"],
      unchanged: 0,
      candidates: 1,
    });
    expect(r.found).toEqual([
      expect.objectContaining({
        earlier: JIRA,
        later: NOTION,
        earlierTitle: "Require Jira tickets for all features",
        laterTitle: "Shift from Notion to a ticket system for bugs",
      }),
    ]);
    expect(db.conflicts).toEqual([
      expect.objectContaining({
        earlier: JIRA,
        later: NOTION,
        status: "open",
        found_on: "2026-09-26",
      }),
    ]);
    const meta = (id: string) => db.chunks.find((c) => c.source_id === id)!.meta;
    expect(meta(JIRA).disputed_by).toEqual([
      { id: NOTION, on: "2026-09-03", kind: "unclear", why: "Two tools named for tracking work." },
    ]);
    expect(meta(NOTION).disputed_by).toEqual([
      { id: JIRA, on: "2026-05-15", kind: "unclear", why: "Two tools named for tracking work." },
    ]);
    expect(meta(FIGMA).disputed_by).toBeUndefined();
    // A topic of one decision is recorded without a model call.
    expect(db.topics.has("brain")).toBe(true);
  });

  it("does not check an unchanged topic again, and does again once a decision arrives", async () => {
    const deps = model({ Jira: found });
    await runRadar(deps, 60_000);
    const calls = (deps.complete as ReturnType<typeof vi.fn>).mock.calls.length;
    const again = await runRadar(deps, 60_000);
    expect(again).toMatchObject({ checked: [], unchanged: 2 });
    expect((deps.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    db.chunks.push(
      chunk("decision:2026-09-20-new", "2026-09-20", "Track all work in Notion", "tooling")
    );
    expect((await runRadar(deps, 60_000)).checked).toEqual(["tooling"]);
  });

  it("leaves a failed topic unrecorded so tomorrow tries it, and stops on a limit", async () => {
    db.chunks.push(chunk("decision:2026-03-01-p1", "2026-03-01", "Price at 29", "pricing"));
    db.chunks.push(chunk("decision:2026-04-01-p2", "2026-04-01", "Price at 39", "pricing"));
    const limited: RadarDeps = {
      now: () => NOW,
      complete: vi.fn(async () => ({ ok: false as const, reason: "rate_limited" as const })),
    };
    const r = await runRadar(limited, 60_000);
    // Alphabetical: brain (single, recorded), pricing (fails, stops), tooling (left).
    expect(r.checked).toEqual(["brain"]);
    expect(r.failed).toEqual([{ topic: "pricing", reason: "rate_limited" }]);
    expect(r.outOfTime).toEqual(["tooling"]);
    expect(limited.complete).toHaveBeenCalledTimes(1);
    expect(db.topics.has("pricing")).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("is not ok when nothing it tried worked, or when it cannot read", async () => {
    const limited: RadarDeps = {
      now: () => NOW,
      complete: vi.fn(async () => ({ ok: false as const, reason: "error" as const })),
    };
    db.chunks = db.chunks.filter((c) => c.meta.topic === "tooling");
    expect((await runRadar(limited, 60_000)).ok).toBe(false);
    db.failGet = "brain_decision_conflict";
    const unread = await runRadar(model({}), 60_000);
    expect(unread).toMatchObject({ ok: false, error: expect.stringMatching(/could not be read/) });
  });

  it("leaves topics for tomorrow once the clock runs out", async () => {
    let t = NOW;
    const deps: RadarDeps = { ...model({ Jira: found }), now: () => (t += 40_000) };
    const r = await runRadar(deps, 60_000);
    expect(r.outOfTime.length).toBeGreaterThan(0);
    for (const topic of r.outOfTime) expect(db.topics.has(topic)).toBe(false);
  });
});

describe("syncDisputes and settling", () => {
  const open = (earlier: string, later: string, extra: Partial<ConflictRow> = {}) => ({
    earlier,
    later,
    topic: "tooling",
    kind: "unclear",
    why: "Two tools.",
    found_on: "2026-09-26",
    status: "open",
    settled_by: null,
    settled_on: null,
    note: null,
    ...extra,
  });

  it("closes a conflict whose decision is gone, and takes the mark off the record that remains", async () => {
    db.conflicts = [open(JIRA, NOTION)];
    db.chunks.find((c) => c.source_id === JIRA)!.meta.disputed_by = [
      { id: NOTION, on: "2026-09-03", kind: "unclear", why: "Two tools." },
    ];
    db.chunks.find((c) => c.source_id === NOTION)!.meta.superseded_by = "decision:2026-09-20-new";
    expect(await syncDisputes("2026-09-26")).toEqual({ autoSettled: 1, marked: 1 });
    expect(db.conflicts[0]).toMatchObject({
      status: "settled",
      settled_by: "the decision radar",
      note: expect.stringContaining(NOTION),
    });
    expect(db.chunks.find((c) => c.source_id === JIRA)!.meta.disputed_by).toBeUndefined();
    // In step already: nothing written the second time.
    mockSupabaseFetch.mockClear();
    expect(await syncDisputes("2026-09-26")).toEqual({ autoSettled: 0, marked: 0 });
    expect(
      mockSupabaseFetch.mock.calls.some(
        ([, init]) => (init as { method?: string } | undefined)?.method
      )
    ).toBe(false);
  });

  it("builds each record's marks from the open conflicts, both ways", () => {
    const marks = disputeMarks(
      [open(JIRA, NOTION) as ConflictRow],
      new Map([
        [JIRA, "2026-05-15"],
        [NOTION, "2026-09-03"],
      ])
    );
    expect(marks.get(JIRA)).toEqual([
      { id: NOTION, on: "2026-09-03", kind: "unclear", why: "Two tools." },
    ]);
    expect(marks.get(NOTION)).toEqual([
      { id: JIRA, on: "2026-05-15", kind: "unclear", why: "Two tools." },
    ]);
  });

  it("settles by marking the other decision superseded, in either order and either id form", async () => {
    db.conflicts = [open(JIRA, NOTION)];
    const r = await settleConflict(
      {
        a: "decision/2026-09-03-notion",
        b: "2026-05-15-jira",
        keep: "later",
        actor: "Eman Cickusic",
        note: "Notion it is",
      },
      new Date(NOW)
    );
    expect(r).toMatchObject({
      ok: true,
      text: expect.stringContaining("decision/2026-09-03-notion stands"),
    });
    expect(db.chunks.find((c) => c.source_id === JIRA)!.meta).toMatchObject({
      superseded_by: NOTION,
      superseded_on: "2026-09-26",
    });
    expect(db.conflicts[0]).toMatchObject({
      status: "settled",
      settled_by: "Eman Cickusic",
      settled_on: "2026-09-26",
      note: "Notion it is",
    });
  });

  it("records both standing without superseding anything, and refuses a second settle or an unknown pair", async () => {
    db.conflicts = [open(JIRA, NOTION)];
    const both = await settleConflict(
      { a: JIRA, b: NOTION, keep: "both", actor: "Mark Oldenburg" },
      new Date(NOW)
    );
    expect(both).toMatchObject({
      ok: true,
      text: expect.stringContaining("will not raise this pair again"),
    });
    expect(db.chunks.every((c) => !c.meta.superseded_by)).toBe(true);
    expect(db.conflicts[0]).toMatchObject({ status: "both_stand" });
    const again = await settleConflict(
      { a: JIRA, b: NOTION, keep: "later", actor: "X" },
      new Date(NOW)
    );
    expect(again).toMatchObject({
      ok: false,
      error: expect.stringMatching(
        /Already settled on 2026-09-26 by Mark Oldenburg \(both stand\)/
      ),
    });
    const unknown = await settleConflict(
      { a: JIRA, b: FIGMA, keep: "later", actor: "X" },
      new Date(NOW)
    );
    expect(unknown).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No recorded conflict/),
    });
  });

  it("settles nothing when the superseded mark cannot be written", async () => {
    db.conflicts = [open(JIRA, NOTION)];
    db.failWrite = "brain_chunk";
    await expect(
      settleConflict({ a: JIRA, b: NOTION, keep: "later", actor: "X" }, new Date(NOW))
    ).rejects.toThrow(/could not mark/);
    expect(db.conflicts[0]).toMatchObject({ status: "open" });
  });
});

describe("listing", () => {
  it("lists open conflicts between current decisions, by topic, as questions", async () => {
    db.conflicts = [
      {
        earlier: JIRA,
        later: NOTION,
        topic: "tooling",
        kind: "unclear",
        why: "Two tools.",
        found_on: "2026-09-26",
        status: "open",
        settled_by: null,
        settled_on: null,
        note: null,
      },
      {
        earlier: JIRA,
        later: FIGMA,
        topic: "tooling",
        kind: "reverses",
        why: "x",
        found_on: "2026-09-26",
        status: "both_stand",
        settled_by: "M",
        settled_on: "2026-09-26",
        note: null,
      },
    ];
    const list = (await openConflicts(null))!;
    expect(list.map((c) => c.later)).toEqual([NOTION]);
    expect(await openConflicts("pricing")).toEqual([]);
    const text = renderConflicts(list, null);
    expect(text).toContain("1 pair of recorded decisions that may not both stand");
    expect(text).toContain("tooling:\n- They may give different answers: Two tools.");
    expect(text).toContain(
      'earlier 2026-05-15: "Require Jira tickets for all features" (decision/2026-05-15-jira)'
    );
    expect(text).toContain(
      "settle_decision_conflict with both ids and keep: earlier, later, or both"
    );
    expect(renderConflicts([], "pricing")).toBe(
      "No open conflicts between recorded decisions on pricing."
    );
  });
});
