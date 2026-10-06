import { describe, expect, it } from "vitest";

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const run = (script: string, remote: string) =>
  spawnSync("bash", [resolve(process.cwd(), script)], {
    env: { ...process.env, CLAUDE_CODE_REMOTE: remote },
    encoding: "utf8",
  });

/**
 * Both scripts run on every laptop too: the hook through .claude/settings.json,
 * the setup whenever someone types it. Outside a Claude cloud session they
 * must do nothing, because the setup runs npm ci, apt and certutil. The cloud
 * behaviour is checked for real by cloud-setup-smoke.yml.
 */
describe("the Claude cloud session scripts", () => {
  it("the session hook is silent on a laptop and points the cloud at the setup", () => {
    expect(run("scripts/cloud-session-start.sh", "").stdout).toBe("");
    const cloud = run("scripts/cloud-session-start.sh", "true");
    expect(cloud.status).toBe(0);
    expect(cloud.stdout).toContain("bash scripts/cloud-probes-setup.sh");
  });

  it("the probe setup refuses to run outside the cloud, before touching anything", () => {
    const local = run("scripts/cloud-probes-setup.sh", "");
    expect(local.status).toBe(1);
    expect(local.stdout).toContain("for Claude cloud sessions only");
  });

  it("runs the hook on every start and resume", () => {
    const hooks = JSON.parse(readFileSync(resolve(process.cwd(), ".claude/settings.json"), "utf8"))
      .hooks.SessionStart;
    expect(hooks[0].matcher).toBe("startup|resume");
    expect(JSON.stringify(hooks)).toContain("scripts/cloud-session-start.sh");
  });
});
