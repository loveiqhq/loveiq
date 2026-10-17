/**
 * The exact_terms backfill walks the table by id, one 1,000-row call at a time, and a run
 * that stops must say where to resume, because resuming is how a lock timeout is handled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Batch = { last_id: number | null; scanned: number; written: number };
let answers: Array<Batch | number | Error> = [];
const bodies: unknown[] = [];
const supabaseFetch = vi.fn(async (path: string, init: { method?: string; body?: string }) => {
  expect(path).toBe("/rest/v1/rpc/brain_backfill_exact_terms");
  expect(init.method).toBe("POST");
  bodies.push(JSON.parse(init.body ?? "null"));
  const next = answers.shift() ?? { last_id: null, scanned: 0, written: 0 };
  if (next instanceof Error) throw next;
  if (typeof next === "number") return new Response("lock timeout", { status: next });
  return new Response(JSON.stringify([next]), { status: 200 });
});
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string, init: { method?: string; body?: string }) =>
    supabaseFetch(path, init),
}));

const log = vi.spyOn(console, "log").mockImplementation(() => {});
const err = vi.spyOn(console, "error").mockImplementation(() => {});

/** Runs the script once, to its last line, with no real pauses. */
async function run(...argv: string[]) {
  process.argv = ["node", "brain-backfill-exact-terms.ts", ...argv];
  vi.resetModules();
  await import("@/scripts/brain-backfill-exact-terms");
  await vi.waitFor(() => {
    const lines = [...log.mock.calls, ...err.mock.calls].map((c) => String(c[0]));
    expect(lines.some((l) => /done:|stopped|must be a row id/.test(l))).toBe(true);
  });
  return [...log.mock.calls, ...err.mock.calls].map((c) => String(c[0]));
}

const argv = process.argv;
beforeEach(() => {
  answers = [];
  bodies.length = 0;
  process.exitCode = undefined;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = undefined;
  supabaseFetch.mockClear();
  log.mockClear();
  err.mockClear();
  vi.mocked(globalThis.setTimeout).mockRestore();
});

describe("brain-backfill-exact-terms", () => {
  it("walks the table by id, 1,000 rows a call, until no row is left", async () => {
    answers = [
      { last_id: 1500, scanned: 1000, written: 400 },
      { last_id: 2900, scanned: 1000, written: 0 },
      { last_id: null, scanned: 0, written: 0 },
    ];
    const lines = await run();
    expect(bodies).toEqual([
      { p_after: 0, p_limit: 1000 },
      { p_after: 1500, p_limit: 1000 },
      { p_after: 2900, p_limit: 1000 },
    ]);
    expect(lines.at(-1)).toMatch(/^\n {2}done: 400 of 2000 rows written in \d+ s$/);
    expect(process.exitCode).toBeUndefined();
  });

  it("starts after the id it is given", async () => {
    await run("--after=123456");
    expect(bodies).toEqual([{ p_after: 123456, p_limit: 1000 }]);
  });

  it("tries a failed batch again and carries on from the same id", async () => {
    answers = [
      500,
      new Error("Request timeout after 30000ms"),
      { last_id: 7, scanned: 3, written: 3 },
    ];
    const lines = await run();
    expect(bodies.slice(0, 3)).toEqual(Array(3).fill({ p_after: 0, p_limit: 1000 }));
    expect(bodies[3]).toEqual({ p_after: 7, p_limit: 1000 });
    expect(lines.filter((l) => l.includes("failed (attempt"))).toHaveLength(2);
    expect(process.exitCode).toBeUndefined();
  });

  it("stops after three failures and says where to resume", async () => {
    answers = [{ last_id: 900, scanned: 1000, written: 10 }, 500, 500, 500];
    const lines = await run();
    expect(supabaseFetch).toHaveBeenCalledTimes(4);
    expect(lines.at(-1)).toBe("  stopped. Resume with --after=900");
    expect(process.exitCode).toBe(1);
  });

  it("refuses an --after that is no row id, before writing anything", async () => {
    const lines = await run("--after=abc");
    expect(supabaseFetch).not.toHaveBeenCalled();
    expect(lines.at(-1)).toBe('  --after must be a row id, got "--after=abc"');
    expect(process.exitCode).toBe(1);
  });
});
