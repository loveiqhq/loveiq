import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const posted: string[] = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    /**
     * Only the chunk WRITES are recorded. `upsertChunks` also reads the person registry
     * now, to derive `meta.people` in one place rather than in seven ingesters — and
     * recording that GET shifted every index in this file, so `posted[0]` became a
     * request with no body and two assertions failed on `JSON.parse(undefined)`.
     * Filtering by path keeps these tests about the payload they are named for.
     */
    if (path.includes("/brain_person")) {
      return new Response("[]", { status: 200 });
    }
    posted.push(String(init?.body));
    return new Response("", { status: 201 });
  }),
}));

import { chunkPage, upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";

function row(over: Partial<BrainRow> = {}): BrainRow {
  return {
    source: "test",
    source_id: `id-${Math.random()}`,
    title: "t",
    url: null,
    body: "b",
    meta: {},
    updated_at: "2026-08-27T00:00:00.000Z",
    ...over,
  };
}

describe("upsertChunks payload shape", () => {
  beforeEach(() => {
    posted.length = 0;
  });

  /**
   * PostgREST answers 400 PGRST102 "All object keys must match" and fails the
   * WHOLE batch when the objects in a bulk insert do not carry identical keys.
   * `period_end` is optional and JSON.stringify drops `undefined`, so one row
   * without it used to break every other row in the batch — the nightly cron
   * died on exactly this.
   */
  it("sends identical keys for every row even when period_end is omitted", async () => {
    await upsertChunks([
      row({ period_end: "2026-08-27" }),
      row(), // omitted entirely
      row({ period_end: null }), // explicit null
    ]);

    const objects = JSON.parse(posted[0]) as Record<string, unknown>[];
    expect(objects).toHaveLength(3);
    const keySets = new Set(objects.map((o) => Object.keys(o).sort().join(",")));
    expect(keySets.size).toBe(1);
    expect(objects.every((o) => "period_end" in o)).toBe(true);
    expect(objects[1].period_end).toBeNull();
  });

  it("keeps a supplied period_end untouched", async () => {
    await upsertChunks([row({ period_end: "2026-08-25" })]);
    expect((JSON.parse(posted[0]) as Record<string, unknown>[])[0].period_end).toBe("2026-08-25");
  });
});

describe("a failed touch must never let the sweep run", () => {
  /**
   * The most dangerous line the audit found. `touchChunks` used to `continue` past
   * a non-2xx PATCH, which left that batch's rows with a stale `updated_at` AND
   * excluded them from `touched` — so `sweepStale`, later in the SAME run, deleted
   * them as orphans. The majority guard only refuses losses above ~50%, so one
   * transient PostgREST 5xx could silently delete up to half a source.
   *
   * The circuit breaker is no help: it counts THROWN errors, and `fetchWithTimeout`
   * resolves normally with a 503 Response, so a run of 5xx looks like successes.
   */
  it("throws instead of silently leaving rows to be swept", async () => {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    vi.mocked(supabaseFetch).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response);

    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await expect(touchChunks("gsc", ["a", "b"], "2026-08-29T00:00:00Z")).rejects.toThrow(
      /aborting before the sweep/
    );
  });

  it("still returns a count when every batch succeeds", async () => {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    vi.mocked(supabaseFetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-range": "*/2" }),
      json: async () => [],
      text: async () => "",
    } as unknown as Response);

    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await expect(touchChunks("gsc", ["a", "b"], "2026-08-29T00:00:00Z")).resolves.toBe(2);
  });
});

describe("every known-chunk read must fail closed", () => {
  /**
   * All five ingesters answered an unreadable corpus list with an empty Map, which
   * reads as "nothing is indexed": existing rows are then neither written nor
   * confirmed, and the sweep in the SAME run deletes them. For notion that meant
   * every continuation part (`#2`, `#3`, …) of every page it did not refetch,
   * silently, with the run reporting success and never rebuilding them.
   *
   * This used to be checked by grepping each ingester for the wording of its own
   * comment, which is why it stayed green while the guard it described was only ever
   * half of one: the status was checked and the BODY was swallowed into `[]` on the
   * next line. A comment cannot fail. The read is now one shared function and these
   * tests call it, so removing either half of the guard fails a test.
   */
  it("routes every ingester's known-chunk read through the one shared reader", async () => {
    // Structural, not textual: the point of consolidating was that eight private
    // copies is why six of them were still wrong.
    const fs = await import("node:fs");
    for (const src of ["notion", "drive", "slack", "gmail", "calendar"]) {
      const code = fs.readFileSync(`features/brain/server/ingest/${src}.ts`, "utf8");
      expect(code, src).toMatch(/chunkPage</);
      expect(code, src).not.toMatch(/res\.json\(\)\.catch\(\(\) => \[\]\)/);
    }
  });

  it("throws on an unreadable STATUS rather than reporting an empty corpus", async () => {
    await expect(chunkPage("drive", new Response("", { status: 500 }))).rejects.toThrow(
      /could not read the existing chunk list/
    );
  });

  it("throws on an unreadable BODY, which is the half that was missing", async () => {
    // `fetchWithTimeout` leaves the AbortController armed through the body read, so a
    // response that stalls AFTER its headers arrives here as ok:true with a body that
    // rejects. The old code turned that into `[]`, `0 < 1000` ended the paging loop,
    // and a truncated keep set was returned as the complete corpus.
    const stalled = new Response("{ not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(chunkPage("gmail", stalled)).rejects.toThrow(/unreadable/);
  });

  it("throws when the body parses but is not a list", async () => {
    // PostgREST answers an error as a JSON OBJECT, which parses fine and has no
    // `.length`, so it would have paged out as a zero-length page.
    const errorObject = new Response(JSON.stringify({ code: "PGRST103", message: "nope" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(chunkPage("notion", errorObject)).rejects.toThrow(/unreadable/);
  });

  it("returns the rows when the page is genuinely readable", async () => {
    // Positive control: a guard that threw unconditionally would pass all of the above.
    const page = new Response(JSON.stringify([{ source_id: "a" }, { source_id: "b" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(chunkPage<{ source_id?: string }>("slack", page)).resolves.toHaveLength(2);
  });
});

describe("a write must be given longer than a read", () => {
  /**
   * The multi-mailbox Gmail run fetched all ten mailboxes successfully and then
   * threw the entire walk away on "Request timeout after 8000ms" at the upsert.
   * A batch of email threads is ~2,400 characters per row plus a regenerated
   * tsvector each; the shared 8s default is a READ timeout and does not fit.
   */
  it("gives the chunk upsert its own generous timeout", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/upsert.ts", "utf8")
    );
    const upsert = src.slice(src.indexOf("export async function upsertChunks"));
    expect(upsert).toMatch(/timeoutMs: 45_000/);
  });
});

describe("touching rows is only ever for the sweep, and it is not free", () => {
  /**
   * Supabase warned on 2026-08-31 that the project was exhausting its Disk IO
   * budget. Cause: `brain_chunk` had 30,213 live rows and 991,115 updates, only
   * 0.3% of them HOT. `updated_at` is an indexed column
   * (`idx_brain_chunk_source` is `btree (source, updated_at DESC)`), so a touch
   * can NEVER be HOT -- each one rewrites the row plus its entries in a 42 MB GIN
   * full-text index, a 30 MB HNSW vector index and a 13 MB trigram index. 227 MB
   * of indexes over a 51 MB heap, and every row rewritten ~33 times.
   *
   * Worse, Gmail and Drive were mid-re-walk, so their sweeps were gated off while
   * the touch still ran: ~25,000 index-rewriting updates an hour with NO consumer.
   *
   * The database this hammers also serves the survey, reports and checkout.
   *
   * Earlier describes in this file replace the shared `supabaseFetch` mock and
   * never restore it, so these assert on the mock's own calls.
   */
  let fetchMock: ReturnType<typeof vi.mocked<never>>;

  beforeEach(async () => {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    fetchMock = vi.mocked(supabaseFetch) as never;
    (fetchMock as unknown as { mockClear: () => void }).mockClear();
    (fetchMock as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-range": "*/3" }),
      json: async () => [],
      text: async () => "",
    });
  });

  it("writes nothing when the caller will not sweep this run", async () => {
    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    const n = await touchChunks("gmail", ["a", "b", "c"], "2026-08-31T00:00:00Z", false);
    expect((fetchMock as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    expect(n).toBe(3); // still CONFIRMED present; only the write was skipped
  });

  it("still writes when the caller will sweep, because then the stamp is load-bearing", async () => {
    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await touchChunks("gmail", ["a", "b"], "2026-08-31T00:00:00Z", true);
    expect(
      (fetchMock as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    ).toBeGreaterThan(0);
  });

  it("defaults to writing, so a caller that always sweeps needs no argument", async () => {
    const { touchChunks } = await import("@features/brain/server/ingest/upsert");
    await touchChunks("ga4", ["a"], "2026-08-31T00:00:00Z");
    expect(
      (fetchMock as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    ).toBeGreaterThan(0);
  });
});

describe("the sweep runs about once a day, and fails closed", () => {
  /**
   * Every ingester used to touch its whole source on EVERY run so the sweep could
   * tell an old-but-true row from a deleted one -- up to 96 times a day for the
   * brain-fast sources. Since no touch can be HOT (see `touchChunks`), that was the
   * write amplification that exhausted the project's Disk IO budget.
   *
   * A source document being deleted is rare and not urgent. Once a day is enough.
   */
  let calls: string[];

  beforeEach(async () => {
    calls = [];
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    (vi.mocked(supabaseFetch) as never as { mockReset: () => void }).mockReset();
  });

  async function withState(body: unknown, ok = true) {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    (
      vi.mocked(supabaseFetch) as never as {
        mockImplementation: (f: (p: string, i?: RequestInit) => unknown) => void;
      }
    ).mockImplementation((p: string, i?: RequestInit) => {
      calls.push(`${(i?.method ?? "GET").toUpperCase()} ${p}`);
      return Promise.resolve({
        ok,
        status: ok ? 200 : 503,
        headers: new Headers(),
        json: async () => body,
        text: async () => "",
      });
    });
    return await import("@features/brain/server/ingest/upsert");
  }

  it("sweeps a source that has never swept", async () => {
    const { shouldSweep } = await withState([]);
    await expect(shouldSweep("gmail")).resolves.toBe(true);
  });

  it("does not sweep again an hour later", async () => {
    const hourAgo = new Date(Date.parse("2026-08-31T12:00:00Z") - 3_600_000).toISOString();
    const { shouldSweep } = await withState([{ swept_at: hourAgo }]);
    await expect(shouldSweep("gmail", Date.parse("2026-08-31T12:00:00Z"))).resolves.toBe(false);
  });

  it("sweeps again after twenty hours", async () => {
    const old = new Date(Date.parse("2026-08-31T12:00:00Z") - 21 * 3_600_000).toISOString();
    const { shouldSweep } = await withState([{ swept_at: old }]);
    await expect(shouldSweep("gmail", Date.parse("2026-08-31T12:00:00Z"))).resolves.toBe(true);
  });

  it("refuses to sweep when the state is unreadable, because deletion is irreversible", async () => {
    const { shouldSweep } = await withState([], false);
    await expect(shouldSweep("gmail")).resolves.toBe(false);
  });

  it("refuses to sweep on an unparseable timestamp rather than guessing", async () => {
    const { shouldSweep } = await withState([{ swept_at: "not a date" }]);
    await expect(shouldSweep("gmail")).resolves.toBe(false);
  });

  it("records the sweep against its own table, not the corpus", async () => {
    const { recordSweep } = await withState([]);
    await recordSweep("gmail", "2026-08-31T12:00:00Z");
    expect(calls.join()).toContain("brain_sweep_state");
    expect(calls.join()).not.toContain("brain_chunk");
  });

  it("never fails the run when the bookkeeping write fails", async () => {
    // One lost write means one extra sweep tomorrow. It must not abort ingestion.
    const { recordSweep } = await withState([], false);
    await expect(recordSweep("gmail")).resolves.toBeUndefined();
  });
});

/**
 * A ONE-TIME LINK IS A CREDENTIAL, AND THE MAILBOX IS FULL OF THEM.
 *
 * `CREDENTIAL_PATTERNS` catches static API keys and REFUSES the whole chunk, which is
 * right when the chunk is a leak. Short-lived auth material in a URL wants the opposite
 * handling: it arrives inside ordinary email threads that do carry content, and one of
 * the shapes (`?token=`) is our own unsubscribe link — so refusing the chunk would
 * delete real email to remove a parameter.
 *
 * Not theoretical. `/api/cron/brain-gmail` runs hourly and an admin magic link is valid
 * for one hour, so a link mailed at :05 was searchable at :11 with most of its life
 * left, in a table everyone can read and every retrieval pastes into a model prompt.
 * Measured 2026-09-09 before this landed: 10 chunks carrying `token_hash=`, 10 `?token=`,
 * plus Supabase signup verifications and a third-party password reset. 41 were redacted.
 */
describe("authentication material in a link never reaches the corpus", () => {
  const SECRETS = [
    [
      "https://www.loveiq.org/admin/auth/callback?token_hash=63bfcdb4aaaa1111&type=magiclink",
      "63bfcdb4aaaa1111",
    ],
    [
      "https://auth.supabase.io/auth/v1/verify?token=abcdef1234567890&type=signup",
      "abcdef1234567890",
    ],
    ["https://www.upwork.com/reset?uart=QQQQwwww1111&x=1", "QQQQwwww1111"],
    ["click https://loveiq.org/unsubscribe?token=aaaabbbbccccdddd to stop", "aaaabbbbccccdddd"],
    ["https://accounts.google.com/o/oauth2?code=4/0AVGpvxyz-abcdefgh", "4/0AVGpvxyz-abcdefgh"],
    ["https://api.example.com/v1?api_key=sk9f8e7d6c5b4a3f2e1d&page=2", "sk9f8e7d6c5b4a3f2e1d"],
  ] as const;

  it("masks the value of every authentication parameter", async () => {
    const { redactUrlSecrets } = await import("@features/brain/server/ingest/upsert");
    for (const [text, secret] of SECRETS) {
      const out = redactUrlSecrets(text);
      expect(out).not.toContain(secret);
      expect(out).toContain("[redacted]");
    }
  });

  it("keeps the parameter NAME, so a reader can still tell what the mail carried", async () => {
    const { redactUrlSecrets } = await import("@features/brain/server/ingest/upsert");
    expect(redactUrlSecrets(SECRETS[0][0])).toContain("token_hash=[redacted]");
    // And the rest of the URL survives — this is a mask, not a deletion.
    expect(redactUrlSecrets(SECRETS[0][0])).toContain("type=magiclink");
  });

  it("leaves ordinary text alone, because a guard that eats real content is worse", async () => {
    const { redactUrlSecrets } = await import("@features/brain/server/ingest/upsert");
    for (const benign of [
      "the error code is 404 and the page renders fine",
      "see https://loveiq.org/report/abc123 for the full report",
      "the survey key metric is signups, tracked under metric_key=signups",
      "PR #1234 changed the token bucket rate limiter",
    ]) {
      expect(redactUrlSecrets(benign)).toBe(benign);
    }
  });

  it("redacts a longer parameter name that a shorter one is a prefix of", async () => {
    const { redactUrlSecrets } = await import("@features/brain/server/ingest/upsert");
    // `token` is a prefix of `token_hash`; alternation is leftmost-first in JS, so the
    // list is sorted longest-first rather than relying on the trailing `=` to save it.
    expect(redactUrlSecrets("?token_hash=aaaabbbbccccdddd")).toBe("?token_hash=[redacted]");
    expect(redactUrlSecrets("?access_token=aaaabbbbccccdddd")).toBe("?access_token=[redacted]");
  });
});

/**
 * TWO IMPLEMENTATIONS OF ONE RULE, KEPT IN AGREEMENT BY TEST.
 *
 * `scripts/brain-ingest-repo.mjs` deliberately does not use `upsertChunks` -- it runs in
 * a GitHub Action with no Next.js module graph and speaks to PostgREST directly -- which
 * is precisely why it was the one write path with no redaction at all until 2026-09-10.
 * Duplicating the patterns is the right call for that constraint; leaving them to drift
 * apart is not, and a pattern added to one and not the other is exactly the failure that
 * would go unnoticed.
 *
 * The script cannot be imported (importing it runs its main against a live database), so
 * its patterns are read out of the source and exercised against the same fixtures.
 */
describe("the repo ingester redacts the same things the shared write path does", () => {
  const FIXTURES: Array<[string, boolean]> = [
    ["https://www.loveiq.org/report/rpt_AbCd1234EfGh5678IjKl", true],
    ["open rpts_AbCd1234EfGh5678IjKl to see it", true],
    ["prepaid rpp_AbCd1234EfGh5678IjKlMnOp to unlock", true],
    ["https://github.com/join?invitation_token=abcdef1234567890", true],
    ["callback?token_hash=63bfcdb4aaaa1111&type=magiclink", true],
    ["https://x.com/y?auth_token=abcd1234", true],
    ["wrapped reset?token=ab\n  cdefgh", true],
    ["the plan is full_report and the metric_key is signups", false],
    ["https://docs.google.com/document/d/1BSVy-_IUY1X6cCyuw5FWrxCMcCA8uDDnO/edit", false],
    ["https://www.notion.so/loveiq/Board-8f2a1c9d4e5b6a7c8d9e0f1a2b3c4d5e", false],
  ];

  it("agrees with the shared implementation on every fixture", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("scripts/brain-ingest-repo.mjs", "utf8");
    const params = /const SECRET_PARAMS =\n([\s\S]*?);\n/.exec(src)?.[1];
    const bare = /const BARE_SECRET_RE = (\/[\s\S]*?\/[a-z]*);/.exec(src)?.[1];
    expect(
      params,
      "SECRET_PARAMS not found in the script — the guard moved or was deleted"
    ).toBeTruthy();
    expect(
      bare,
      "BARE_SECRET_RE not found in the script — the guard moved or was deleted"
    ).toBeTruthy();

     
    const paramList = eval(params!) as string;
    const paramRe = new RegExp(`([?&#][a-z0-9_.-]*(?:${paramList})=)[^\\s&"'<>)\\]]+`, "gi");
     
    const bareRe = eval(bare!) as RegExp;
    const scriptRedact = (t: string) =>
      t.replace(paramRe, "$1[redacted]").replace(new RegExp(bareRe.source, "g"), "[redacted]");

    const { redactUrlSecrets } = await import("@features/brain/server/ingest/upsert");
    for (const [input, mustChange] of FIXTURES) {
      const shared = redactUrlSecrets(input);
      const script = scriptRedact(input);
      expect(script, `script disagrees with upsert.ts on: ${input}`).toBe(shared);
      expect(shared !== input, `wrong verdict on: ${input}`).toBe(mustChange);
    }
  });
});
