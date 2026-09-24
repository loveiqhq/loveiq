import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * The cloud environment keeps its own pasted copy of the setup script, so the
 * pin in the file is the one reminder that a Playwright upgrade has to be
 * pasted there too. Behaviour is checked for real by cloud-setup-smoke.yml.
 */
describe("the Claude cloud environment setup", () => {
  it("fetches the browser builds for the Playwright the repo installs", () => {
    const lock = JSON.parse(read("package-lock.json"));
    const installed = lock.packages["node_modules/@playwright/test"].version;
    const pinned = /playwright@(\d+\.\d+\.\d+)/.exec(
      read("scripts/cloud-environment-setup.sh")
    )?.[1];
    expect(pinned, "bump the pin, then paste the script into the environment again").toBe(
      installed
    );
  });

  it("runs the session hook in the cloud only, and on every start and resume", () => {
    const hooks = JSON.parse(read(".claude/settings.json")).hooks.SessionStart;
    expect(JSON.stringify(hooks)).toContain("scripts/cloud-session-start.sh");
    expect(hooks[0].matcher).toBe("startup|resume");
    // Local sessions run it too; the first thing it does is leave.
    expect(read("scripts/cloud-session-start.sh")).toMatch(
      /^\[ "\$CLAUDE_CODE_REMOTE" = "true" \] \|\| exit 0$/m
    );
  });
});
