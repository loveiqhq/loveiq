/**
 * A vulnerability must block the merge. An OUTAGE must not.
 *
 * `npm audit` calls a registry endpoint. On 2026-09-19 that endpoint answered
 * `503 Service Unavailable — We are currently performing maintenance` for the
 * better part of an hour, the step exited 1, Lint failed, Build skipped because
 * it needs Lint — and Lint and Build are both REQUIRED checks, so nothing in
 * the repository could be merged by anyone. A required check that treats a
 * third-party outage the same as a finding is a self-inflicted outage.
 *
 * The counting logic is what tells the two apart, so it is pinned here rather
 * than left to be discovered during the next npm incident.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CI = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const SECURITY = readFileSync(resolve(process.cwd(), ".github/workflows/security.yml"), "utf8");

/** The exact expression the workflow runs, lifted out so they cannot drift. */
const COUNTER =
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).metadata.vulnerabilities;console.log((v.high||0)+(v.critical||0))}catch{console.log("unknown")}})';

const count = (input: string) =>
  execFileSync("node", ["-e", COUNTER], { input, encoding: "utf8" }).trim();

describe("the npm audit gate", () => {
  it("counts high and critical advisories", () => {
    expect(count('{"metadata":{"vulnerabilities":{"high":2,"critical":0}}}')).toBe("2");
    expect(count('{"metadata":{"vulnerabilities":{"high":0,"critical":1}}}')).toBe("1");
  });

  it("passes a clean report even when low and moderate exist", () => {
    expect(
      count('{"metadata":{"vulnerabilities":{"low":3,"moderate":1,"high":0,"critical":0}}}')
    ).toBe("0");
  });

  it("says UNKNOWN when the registry did not answer", () => {
    // Each of these is what an outage actually looks like, not a guess: an
    // empty body, npm's error object, and a truncated response.
    expect(count("")).toBe("unknown");
    expect(count('{"message":"audit endpoint returned an error"}')).toBe("unknown");
    expect(count('{"metadata":{"vulner')).toBe("unknown");
  });

  it("is wired into CI with the same expression", () => {
    const normalised = CI.replace(/\\\s*\n\s*/g, "");
    expect(normalised).toContain("metadata.vulnerabilities");
    expect(normalised).toContain('console.log("unknown")');
  });

  it("warns rather than failing on unknown, and fails on a real finding", () => {
    expect(CI).toMatch(/if \[ "\$high" = "unknown" \][\s\S]{0,300}?exit 0/);
    expect(CI).toMatch(/if \[ "\$high" -gt 0 \][\s\S]{0,300}?exit 1/);
  });

  /**
   * There were TWO of these, and fixing only the one that blocked the merge
   * would have left the other going red on every npm incident — a security job
   * that is red for reasons nobody can act on is one people learn to scroll
   * past, which costs more than it saves.
   */
  it("applies the same rule in security.yml, not just the blocking one", () => {
    expect(SECURITY).toContain("metadata.vulnerabilities");
    expect(SECURITY).toMatch(/if \[ "\$high" = "unknown" \][\s\S]{0,300}?exit 0/);
    expect(SECURITY).toMatch(/if \[ "\$high" -gt 0 \][\s\S]{0,300}?exit 1/);
  });

  it("leaves no bare `npm audit` that can fail on an outage", () => {
    // The whole class, not the two instances that happened to be found.
    for (const [name, wf] of [
      ["ci.yml", CI],
      ["security.yml", SECURITY],
    ] as const) {
      const bare = wf
        .split("\n")
        .filter(
          (l) => /^\s*run:\s*npm audit/.test(l) || /^\s+npm audit --audit-level=high$/.test(l)
        );
      expect(bare, `${name} still has a bare npm audit: ${bare.join(" | ")}`).toEqual([]);
    }
  });

  it("does not use the deprecated --production flag", () => {
    // npm 11 warns on it and it will eventually stop working.
    expect(CI).not.toContain("npm audit --audit-level=high --production");
  });
});
