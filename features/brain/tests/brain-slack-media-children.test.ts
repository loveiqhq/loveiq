import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The programs this job starts, and what each is handed. The uploads they open are untrusted
 * (a shared channel lets other workspaces post), and this job's own environment holds the
 * Supabase service key and three tokens, so the parsers must get none of it.
 */
const calls: Array<{ file: string; args: string[]; env: Record<string, unknown> }> = [];
let missing: string | null = null;
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: (
    file: string,
    args: string[],
    opts: { env: Record<string, unknown> },
    cb: (err: Error | null, out?: { stdout: string; stderr: string }) => void
  ) => {
    calls.push({ file, args, env: opts.env });
    if (file === missing) {
      cb(Object.assign(new Error(`spawn ${file} ENOENT`), { code: "ENOENT" }));
      return;
    }
    if (file === "ffmpeg") writeFileSync(args[args.length - 1]!, "jpg");
    cb(null, { stdout: file === "ffprobe" ? "15.1\n" : "", stderr: "" });
  },
}));

const mockRunClaude = vi.fn();
vi.mock("@features/brain/server/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/llm")>()),
  runClaude: (...a: unknown[]) => mockRunClaude(...a),
}));

import {
  describeArgs,
  describeWithClaude,
  videoFrames,
} from "@features/brain/server/ingest/slack-media";

const SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SLACK_BRAIN_BOT_TOKEN: "xoxb-secret",
  LOVEIQ_MCP_TOKEN: "mcp-secret",
  SLACK_BRAIN_WEBHOOK_URL: "https://hooks.slack.com/secret",
};

let dir = "";
beforeEach(() => {
  calls.length = 0;
  missing = null;
  mockRunClaude.mockReset();
  for (const [name, value] of Object.entries({
    ...SECRETS,
    CLAUDE_CODE_OAUTH_TOKEN: "oauth",
    BRAIN_LLM_CLI: "claude",
  })) {
    vi.stubEnv(name, value);
  }
  dir = mkdtempSync(join(tmpdir(), "slack-media-test-"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("ffprobe and ffmpeg", () => {
  it("get PATH and nothing else, so a hostile upload finds no secret to read", async () => {
    await videoFrames(join(dir, "video.mp4"), dir);
    expect(calls.map((c) => c.file)).toEqual(["ffprobe", "ffmpeg", "ffmpeg", "ffmpeg", "ffmpeg"]);
    for (const c of calls) expect(c.env).toEqual({ PATH: process.env.PATH });
  });

  it("are held to local files and a named format, so nothing is fetched on the upload's say", async () => {
    await videoFrames(join(dir, "video.mp4"), dir);
    for (const c of calls) {
      const input = c.args.indexOf(join(dir, "video.mp4"));
      const before = c.args.slice(0, input).join(" ");
      expect(before).toContain("-protocol_whitelist file -f mov");
    }
    expect(calls.filter((c) => c.file === "ffmpeg").every((c) => c.args[0] === "-nostdin")).toBe(
      true
    );
    calls.length = 0;
    await videoFrames(join(dir, "video.webm"), dir);
    expect(calls[0]!.args.join(" ")).toContain("-protocol_whitelist file -f matroska");
    await expect(videoFrames(join(dir, "video.m3u8"), dir)).rejects.toThrow(/not a recording/);
  });

  it("report a missing ffmpeg as such, so the run can say what to fix", async () => {
    missing = "ffprobe";
    await expect(videoFrames(join(dir, "video.mp4"), dir)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("claude", () => {
  it("gets the scrubbed environment, the confined arguments, and the image's folder", async () => {
    mockRunClaude.mockResolvedValue({ ok: true, text: "x", truncated: false });
    await describeWithClaude(dir, "Describe it", 1000);
    const [binary, args, , , cwd, env] = mockRunClaude.mock.calls[0]!;
    expect(binary).toBe("claude");
    expect(args).toEqual(describeArgs("sonnet", dir));
    expect(cwd).toBe(dir);
    expect(env).toMatchObject({ CLAUDE_CODE_OAUTH_TOKEN: "oauth", PATH: process.env.PATH });
    for (const name of Object.keys(SECRETS)) expect(env).not.toHaveProperty(name);
  });
});
