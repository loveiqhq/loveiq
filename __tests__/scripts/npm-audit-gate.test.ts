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

import { acceptedAdvisories, unacceptedAdvisories } from "../../scripts/lib/npm-audit-gate.mjs";

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
    expect(SECURITY).toContain("node scripts/npm-audit-gate.mjs");
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

/**
 * security.yml audits dev dependencies too, so it is the gate that meets
 * advisories nobody can fix yet. On 2026-10-04 one for `braces` (every release
 * affected, none fixed, reached only through build tooling) turned it red on
 * every push. It now subtracts the reviewed exceptions in .osv-scanner.toml, the
 * list the OSV step already reads, and nothing else.
 */
describe("security.yml's npm audit gate", () => {
  const BRACES = "GHSA-vfj7-8cjw-p6xm";
  const advisory = (id: string, severity = "high") => ({
    source: 1,
    name: "braces",
    title: "a finding",
    url: `https://github.com/advisories/${id}`,
    severity,
  });
  // The real shape: the advisory object sits on the package it is filed
  // against, and everything that depends on it names that package as a string.
  // The totals count packages, as npm's do.
  const report = (...advisories: ReturnType<typeof advisory>[]) => {
    const severe = advisories.some((a) => a.severity === "high" || a.severity === "critical");
    const severity = severe ? "high" : "moderate";
    return JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {
        braces: { name: "braces", severity, via: advisories },
        micromatch: { name: "micromatch", severity, via: ["braces"] },
        "fast-glob": { name: "fast-glob", severity, via: ["micromatch"] },
      },
      metadata: {
        vulnerabilities: { low: 0, moderate: severe ? 0 : 3, high: severe ? 3 : 0, critical: 0 },
      },
    });
  };
  const toml = (entry: string) => `[[IgnoredVulns]]\nid = "${BRACES}"\n${entry}\nreason = "r"\n`;
  const NOW = new Date("2026-10-04T12:00:00Z");
  const gate = (text: string, config = "") =>
    unacceptedAdvisories(text, acceptedAdvisories(config), NOW).count;

  it("counts each advisory once, not each package that depends on it", () => {
    expect(gate(report(advisory(BRACES)))).toBe(1);
    expect(gate(report(advisory(BRACES), advisory("GHSA-aaaa-bbbb-cccc", "critical")))).toBe(2);
  });

  it("does not count low or moderate advisories", () => {
    expect(gate(report(advisory(BRACES, "moderate")))).toBe(0);
  });

  it("subtracts an accepted advisory, and only that one", () => {
    expect(gate(report(advisory(BRACES)), toml("ignoreUntil = 2026-12-04"))).toBe(0);
    expect(gate(report(advisory(BRACES)), toml(""))).toBe(0);
    expect(
      gate(
        report(advisory(BRACES), advisory("GHSA-aaaa-bbbb-cccc")),
        toml("ignoreUntil = 2026-12-04")
      )
    ).toBe(1);
  });

  it("counts an accepted advisory again once its date has passed", () => {
    const result = unacceptedAdvisories(
      report(advisory(BRACES)),
      acceptedAdvisories(toml("ignoreUntil = 2026-10-01")),
      NOW
    );
    expect(result.count).toBe(1);
    expect(result.expired).toEqual([BRACES.toUpperCase()]);
  });

  it("treats a date it cannot read as passed, never as permanent", () => {
    expect(gate(report(advisory(BRACES)), toml("ignoreUntil = soon"))).toBe(1);
  });

  it("says UNKNOWN on the same outage shapes as ci.yml", () => {
    expect(gate("")).toBe("unknown");
    expect(gate('{"message":"audit endpoint returned an error"}')).toBe("unknown");
    expect(gate('{"metadata":{"vulner')).toBe("unknown");
  });

  it("fails closed on a report that flags something it cannot itemise", () => {
    const opaque = JSON.stringify({ metadata: { vulnerabilities: { high: 2, critical: 0 } } });
    expect(gate(opaque)).toBe(2);
  });

  it("reads every entry of the real .osv-scanner.toml", () => {
    const config = readFileSync(resolve(process.cwd(), ".osv-scanner.toml"), "utf8");
    const entries = config.match(/^\[\[IgnoredVulns\]\]$/gm) ?? [];
    expect(acceptedAdvisories(config).size).toBe(entries.length);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("prints the count the workflow compares, from the real script", () => {
    const run = (input: string) =>
      execFileSync("node", ["scripts/npm-audit-gate.mjs"], {
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    expect(run(report(advisory("GHSA-aaaa-bbbb-cccc")))).toBe("1");
    expect(run(report(advisory("GHSA-aaaa-bbbb-cccc", "moderate")))).toBe("0");
    expect(run("")).toBe("unknown");
  });
});
