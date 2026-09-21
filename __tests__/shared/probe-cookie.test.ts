/**
 * A probe is not a reader, and the two halves of that must not drift.
 *
 * `scripts/probes/staging-cookie.mjs` sets the cookie; `app/api/report/route.ts`
 * reads it. They sit on opposite sides of the Next build — scripts/ is
 * deliberately outside it — so the name is a literal in two files. A rename
 * reaching only one would silently restore the pollution and nothing would
 * fail: the report would still render, the probe would still pass, and
 * `report_session` would quietly fill with robots again.
 *
 * Measured 2026-09-21 before the guard: 73% of report_session over 30 days was
 * internal, 1,505 rows on the single report the probes hammer, climbing (52%
 * all time, 63% over 90 days). Eight admin routes read that table unfiltered.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isProbeRequest, PROBE_COOKIE } from "@shared/http/probe-cookie";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("the probe marker", () => {
  it("is the same name on both sides of the build", () => {
    const helper = read("scripts/probes/staging-cookie.mjs");
    expect(helper).toContain(`export const PROBE_COOKIE = "${PROBE_COOKIE}";`);
  });

  it("is sent even when there is no staging password — i.e. on production", () => {
    // The staging cookie is skipped when no password is set, which is exactly
    // the production case and exactly where the marker is needed. Returning
    // both from one early exit would have shipped a marker that is dropped on
    // the only target that matters.
    const helper = read("scripts/probes/staging-cookie.mjs");
    expect(helper).toContain("if (!password) return [probe];");
  });

  it("is what the report route actually checks before writing a session row", () => {
    const route = read("app/api/report/route.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // The guard exists...
    expect(route).toMatch(/const isProbe = /);
    // ...and it is what gates the write, not merely computed and ignored.
    expect(route).toMatch(/if \(isProbe\) \{[\s\S]{0,80}\} else if \(access\.personalReportId/);
    expect(route).toContain("isProbeRequest");
  });

  it("matches the cookie exactly, not as a substring of another one", () => {
    /**
     * Grades THE FUNCTION THE ROUTE CALLS, not a copy of its regex.
     *
     * The first version rebuilt the pattern here and asserted that. Loosening
     * the route's match to a bare substring then changed nothing the suite
     * could see — caught by mutation, which is the only way that kind of test
     * ever announces itself.
     */
    expect(isProbeRequest(`${PROBE_COOKIE}=1`)).toBe(true);
    expect(isProbeRequest(`a=b; ${PROBE_COOKIE}=1`)).toBe(true);
    expect(isProbeRequest(`a=b; ${PROBE_COOKIE}=1; c=d`)).toBe(true);
    expect(isProbeRequest(`not_${PROBE_COOKIE}=1`)).toBe(false);
    expect(isProbeRequest(`${PROBE_COOKIE}=10`)).toBe(false);
    expect(isProbeRequest(`${PROBE_COOKIE}=0`)).toBe(false);
    expect(isProbeRequest("")).toBe(false);
    expect(isProbeRequest(null)).toBe(false);
    expect(isProbeRequest(undefined)).toBe(false);
  });
});
