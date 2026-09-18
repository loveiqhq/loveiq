import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { capQuery, hasOwnLimit, HOG_ROW_CAP, hogQuery } from "../../scripts/lib/hogql.mjs";

/**
 * PostHog caps an unstated HogQL query at 100 rows and says nothing about it.
 * Measured on production: a bare `SELECT DISTINCT session_id FROM
 * raw_session_replay_events` over eight days returned 100 against a true 605.
 *
 * It had already bitten `ux-review-coverage.mjs`, whose own header documents a
 * DAYS=7 mode that is 109 submissions — past the cap, so the script that exists
 * to find blind spots was misclassifying submissions using truncated sets.
 *
 * These tests exist because the failure is invisible: the query succeeds, the
 * rows look fine, and only the count is wrong.
 */
afterEach(() => vi.unstubAllGlobals());

describe("HogQL queries state a row limit", () => {
  it("appends a cap to a query that has none", () => {
    expect(capQuery("SELECT DISTINCT x FROM y")).toBe(
      `SELECT DISTINCT x FROM y\nLIMIT ${HOG_ROW_CAP}`
    );
  });

  it("leaves a query that states its own", () => {
    expect(capQuery("SELECT x FROM y LIMIT 10")).toBe("SELECT x FROM y LIMIT 10");
  });

  it("does not mistake a subquery's LIMIT for the outer one", () => {
    // The dangerous direction: reading this as capped leaves the silent 100 in
    // place on a query that returns many rows.
    expect(hasOwnLimit("SELECT a FROM (SELECT b FROM c LIMIT 5) GROUP BY a")).toBe(false);
  });

  it("runs its own selftest clean", () => {
    expect(() =>
      execFileSync("node", ["scripts/lib/hogql.mjs", "--selftest"], { encoding: "utf8" })
    ).not.toThrow();
  });

  /**
   * PostHog sheds load with 503 and says so in the body. The first one arrived
   * right after this repo queued 133 scanner workflows — our own traffic — so a
   * client without retry turns routine self-inflicted congestion into a crash.
   */
  it("retries a 503 and succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return calls < 3
        ? { ok: false, status: 503, text: async () => "busy" }
        : { ok: true, json: async () => ({ results: [[1]] }) };
    });
    const p = hogQuery("SELECT 1", { projectId: "p", apiKey: "k" });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual([[1]]);
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it("does NOT retry a 400 — a bad query fails the same way twice", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return { ok: false, status: 400, text: async () => "bad query" };
    });
    await expect(hogQuery("SELECT nope", { projectId: "p", apiKey: "k" })).rejects.toThrow(
      /posthog 400/
    );
    expect(calls).toBe(1);
  });

  it("does not cry wolf when a deliberate LIMIT 1 returns one row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ results: [["x"]] }) }));
    await hogQuery("SELECT a FROM b LIMIT 1", { projectId: "p", apiKey: "k" });
    expect(warn, "a single-row read is not a truncation").not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still warns when a real limit is hit exactly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ results: [["a"], ["b"], ["c"]] }),
    }));
    await hogQuery("SELECT a FROM b LIMIT 3", { projectId: "p", apiKey: "k" });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  /**
   * The ratchet. Three near-identical uncapped helpers existed before this, each
   * written by someone who did not know about the other two. A fourth must not
   * be able to appear quietly.
   */
  it("has no HogQL construction site outside the two capped helpers", () => {
    const ALLOWED = ["scripts/lib/hogql.mjs", "features/ux-review/server/review.ts"];
    const SKIP = new Set(["node_modules", ".next", ".git", "playwright-report", "coverage"]);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(name)) continue;
        const rel = full.replace(`${process.cwd()}/`, "");
        if (ALLOWED.includes(rel) || rel.startsWith("__tests__/")) continue;
        if (/kind:\s*"HogQLQuery"/.test(readFileSync(full, "utf8"))) offenders.push(rel);
      }
    };
    walk(process.cwd());

    expect(
      offenders,
      `these build HogQL directly and so inherit PostHog's silent 100-row cap; ` +
        `route them through scripts/lib/hogql.mjs`
    ).toEqual([]);
  });
});
