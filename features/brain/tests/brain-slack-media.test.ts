import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * A small Slack workspace, shaped like what the real one returned on 2026-10-11: files.list
 * gives the file and the channels it is in, files.info gives the message it was shared with.
 */
interface FakeFile {
  id: string;
  name: string;
  filetype: string;
  size: number;
  mode?: string;
  url_private?: string;
  created: number;
  channels?: string[];
  groups?: string[];
  ims?: string[];
}
let files: FakeFile[] = [];
/** file id -> where it was shared, keyed by channel id. */
let shares: Record<string, Record<string, Array<{ ts: string; thread_ts?: string }>>> = {};
/** message ts -> the message. */
let messages: Record<string, Record<string, unknown>> = {};
/** What a download answers: the content type, or a status. */
let downloadAs: { type?: string; status?: number } = { type: "image/png" };
let downloads = 0;

const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
});

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.hostname === "files.slack.com") {
      downloads += 1;
      return answer(null, downloadAs.status ?? 200, { "content-type": downloadAs.type ?? "" });
    }
    const method = u.pathname.split("/").pop();
    const q = (k: string) => u.searchParams.get(k) ?? "";
    switch (method) {
      case "conversations.list":
        return answer({
          ok: true,
          channels: [
            { id: "C1", name: "all-loveiq", is_member: true },
            { id: "C2", name: "bugs-issues", is_member: true, is_private: true },
            // A member, and still never read: candidates are discussed here.
            { id: "C3", name: "hr", is_member: true, is_private: true },
            { id: "C4", name: "random", is_member: false },
          ],
        });
      case "files.list":
        return answer({ ok: true, files, paging: { pages: 1 } });
      case "users.list":
        return answer({
          ok: true,
          members: [
            { id: "U1", profile: { real_name: "Marcus Börner" } },
            { id: "U2", profile: { real_name: "Eman" } },
          ],
        });
      case "auth.test":
        return answer({ ok: true, url: "https://loveiq.slack.com/" });
      case "files.info":
        return answer({ ok: true, file: { id: q("file"), shares: { public: shares[q("file")] } } });
      case "conversations.history":
      case "conversations.replies": {
        const m = messages[q("latest")];
        return answer({ ok: true, messages: m ? [m] : [] });
      }
      default:
        return answer({ ok: false, error: "unknown_method" });
    }
  }),
}));

/** brain_chunk, as far as this job reads it: the ids of files already described. */
const stored = new Set<string>();
let storedUnreadable = false;
const mockSupabase = vi.fn(async (path: string) => {
  if (storedUnreadable) return { ok: false, status: 503, json: async () => null };
  expect(path).toContain("source=eq.slack");
  expect(path).toContain(`source_id=like.${encodeURIComponent("file:*")}`);
  return {
    ok: true,
    status: 200,
    json: async () => [...stored].map((source_id) => ({ source_id })),
  };
});
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string) => mockSupabase(path),
}));

import type { LlmResult } from "@features/brain/server/llm";
import {
  cleanDescription,
  describeArgs,
  describeSlackMedia,
  filesToDescribe,
  frameTimes,
  MAX_DESCRIPTIONS_PER_RUN,
  mediaRow,
  RUN_BUDGET_MS,
  type MediaDeps,
  type SlackFile,
} from "@features/brain/server/ingest/slack-media";
import type { BrainRow } from "@features/brain/server/ingest/upsert";

const png = (id: string, created: number, over: Partial<FakeFile> = {}): FakeFile => ({
  id,
  name: "image.png",
  filetype: "png",
  size: 200_000,
  mode: "hosted",
  url_private: `https://files.slack.com/files-pri/T1-${id}/image.png`,
  created,
  channels: ["C1"],
  ...over,
});

/** A file shared by Marcus in #all-loveiq, as its own message. */
function share(file: FakeFile, ts: string, text = "the report page is broken on my phone") {
  shares[file.id] = { [file.channels?.[0] ?? file.groups?.[0] ?? "C1"]: [{ ts }] };
  messages[ts] = { user: "U1", text, ts, files: [{ id: file.id, name: file.name }] };
}

const written: BrainRow[] = [];
const prompts: string[] = [];
const dirsSeen: string[][] = [];
let answers: LlmResult[] = [];
let clock = 0;

const deps = (over: Partial<MediaDeps> = {}): MediaDeps => ({
  describe: async (dir, prompt) => {
    prompts.push(prompt);
    dirsSeen.push(readdirSync(dir).sort());
    return answers.shift() ?? { ok: true, text: "The LoveIQ report on a phone.", truncated: false };
  },
  frames: async (_video, dir) => {
    const frames = [1.9, 5.7, 9.4, 13.2].map((at, i) => {
      const path = join(dir, `frame-${i + 1}.jpg`);
      writeFileSync(path, "jpg");
      return { path, at };
    });
    return { seconds: 15.1, frames };
  },
  write: async (rows) => {
    written.push(...rows);
    for (const r of rows) stored.add(r.source_id);
    return rows.length;
  },
  now: () => clock,
  ...over,
});

beforeEach(() => {
  process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
  files = [];
  shares = {};
  messages = {};
  downloadAs = { type: "image/png" };
  downloads = 0;
  stored.clear();
  storedUnreadable = false;
  written.length = 0;
  prompts.length = 0;
  dirsSeen.length = 0;
  answers = [];
  clock = 0;
});

describe("which files are described", () => {
  const channels = new Set(["C1", "C2"]);
  const file = (over: Partial<SlackFile>): SlackFile => ({ ...png("F0", 100), ...over });

  it("takes screenshots and recordings in the channels the Slack walk indexes, newest first", () => {
    const picked = filesToDescribe(
      [
        file({ id: "F1", created: 100 }),
        file({ id: "F2", created: 300, filetype: "mp4", size: 3_600_000 }),
        file({ id: "F3", created: 200, filetype: "jpg", channels: [], groups: ["C2"] }),
      ],
      channels,
      new Set()
    );
    expect(picked.map((f) => f.id)).toEqual(["F2", "F3", "F1"]);
  });

  it("leaves out what the brain must not read or cannot", () => {
    const picked = filesToDescribe(
      [
        file({ id: "keep", created: 1 }),
        // A DM, a denylisted or unjoined channel: not in the set the walk indexes.
        file({ id: "dm", channels: [], groups: [] }),
        file({ id: "hr", channels: ["C3"] }),
        // Not a picture.
        file({ id: "pdf", filetype: "pdf", name: "deck.pdf" }),
        file({ id: "heic", filetype: "heic" }),
        // A link to a file elsewhere, and a deleted one.
        file({ id: "ext", mode: "external" }),
        file({ id: "gone", mode: "tombstone" }),
        file({ id: "nourl", url_private: undefined }),
        file({ id: "big", size: 10_000_001 }),
        file({ id: "empty", size: 0 }),
        // The names every reader of a named file refuses (upsert.ts).
        file({ id: "cv", name: "CV_Jane_Doe.png" }),
        file({ id: "nda", name: "Confidentiality Agreement signed.png" }),
      ],
      channels,
      new Set()
    );
    expect(picked.map((f) => f.id)).toEqual(["keep"]);
  });

  it("never picks a file that already has a description", () => {
    const picked = filesToDescribe(
      [file({ id: "F1" }), file({ id: "F2" })],
      channels,
      new Set(["F1"])
    );
    expect(picked.map((f) => f.id)).toEqual(["F2"]);
  });

  it("allows a recording to be bigger than a screenshot, within a ceiling", () => {
    const mp4 = (size: number) => file({ id: `v${size}`, filetype: "mp4", size });
    const picked = filesToDescribe([mp4(17_900_000), mp4(50_000_001)], channels, new Set());
    expect(picked.map((f) => f.id)).toEqual(["v17900000"]);
  });
});

describe("which frames are taken from a recording", () => {
  it("takes at least one every five seconds, from inside the recording", () => {
    // The real recording of 2026-10-09 is 15.1 seconds.
    expect(frameTimes(15.1)).toEqual([1.9, 5.7, 9.4, 13.2]);
  });

  it("spreads at most eight over a long recording, so its end is not cut off", () => {
    const times = frameTimes(120);
    expect(times).toHaveLength(8);
    expect(times[0]).toBe(7.5);
    expect(times[7]).toBe(112.5);
  });

  it("takes one from a short recording, and none when the length is unknown", () => {
    expect(frameTimes(3)).toEqual([1.5]);
    expect(frameTimes(0)).toEqual([]);
    expect(frameTimes(Number.NaN)).toEqual([]);
  });
});

describe("the row a description becomes", () => {
  const base = {
    fileId: "F0C80A6Q2KF",
    channel: "all-loveiq",
    channelId: "C09P0Q266R1",
    ts: "1791574369.704089",
    line: "Marcus Börner: the report page is broken [shared: ScreenRecording_1.MP4]",
    speaker: "Marcus Börner",
    workspaceUrl: "https://loveiq.slack.com/",
    stampedAt: "2026-10-11T05:41:00.000Z",
  };

  it("is a slack row of its own, keyed on the file, linked to the message, dated by it", () => {
    const row = mediaRow({ ...base, kind: "video", description: "The paywall never opens." });
    expect(row).toMatchObject({
      source: "slack",
      source_id: "file:F0C80A6Q2KF",
      url: "https://loveiq.slack.com/archives/C09P0Q266R1/p1791574369704089",
      period_end: "2026-10-09",
      updated_at: "2026-10-11T05:41:00.000Z",
      title: "Slack #all-loveiq — 2026-10-09 — screen recording shared by Marcus Börner",
    });
    // Never `ch:`: the Slack walk would read it as a day to refetch.
    expect(row.source_id.startsWith("ch:")).toBe(false);
    expect(row.meta).toMatchObject({
      kind: "slack-file",
      channel: "all-loveiq",
      day: "2026-10-09",
      file: "F0C80A6Q2KF",
      media: "video",
      speakers: ["Marcus Börner"],
    });
  });

  it("carries the message and the description together, so search finds them together", () => {
    const body = mediaRow({
      ...base,
      kind: "image",
      description: "An error reads 'Not found'.",
    }).body;
    expect(body.split("\n")).toEqual([
      "Slack #all-loveiq — 2026-10-09 — screenshot shared by Marcus Börner",
      base.line,
      "[screenshot: An error reads 'Not found'.]",
    ]);
  });

  it("keeps a long caption from pushing the description out of the chunk", () => {
    const body = mediaRow({
      ...base,
      kind: "image",
      line: `Marcus Börner: ${"word ".repeat(500)}`,
      description: "d".repeat(1_200),
    }).body;
    expect(body.length).toBeLessThan(2_400);
    expect(body.endsWith(`${"d".repeat(1_200)}]`)).toBe(true);
  });

  it("writes no email address, however the model phrased it, and stays one bounded line", () => {
    expect(
      cleanDescription("The admin panel lists anna.k+test@gmail.com and\n\nher answers.")
    ).toBe("The admin panel lists an email address and her answers.");
    expect(cleanDescription("x ".repeat(2_000)).length).toBe(1_200);
  });
});

describe("what the model may touch", () => {
  it("may only Read, and only inside the folder that holds the image", () => {
    const args = describeArgs("sonnet", "/tmp/slack-media-abc/");
    expect(args[args.indexOf("--tools") + 1]).toBe("Read");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("Read(//tmp/slack-media-abc/**)");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(args).not.toContain("--add-dir");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--system-prompt") + 1]).toMatch(/Never write down personal data/);
  });
});

describe("describeSlackMedia", () => {
  it("describes each waiting file once, and a second run describes nothing", async () => {
    const a = png("FA", 1_791_380_415);
    const b = png("FB", 1_791_574_369, { channels: [], groups: ["C2"] });
    files = [a, b];
    share(a, "1791380415.842289");
    // Shared with no caption, in a private channel.
    shares[b.id] = { C2: [{ ts: "1791574369.704089" }] };
    messages["1791574369.704089"] = {
      user: "U2",
      ts: "1791574369.704089",
      files: [{ id: "FB", name: "image.png" }],
    };

    const first = await describeSlackMedia(deps());
    expect(first).toMatchObject({ waiting: 2, described: 2, failed: 0, error: null });
    expect(written.map((r) => r.source_id)).toEqual(["file:FB", "file:FA"]);
    expect(written[1]!.body).toContain(
      "Marcus Börner: the report page is broken on my phone [shared: image.png]"
    );
    expect(written[1]!.body).toContain("[screenshot: The LoveIQ report on a phone.]");
    expect(written[0]!.meta).toMatchObject({ channel: "bugs-issues", speakers: ["Eman"] });

    const second = await describeSlackMedia(deps());
    expect(second).toMatchObject({ waiting: 0, described: 0 });
    expect(prompts).toHaveLength(2);
    expect(downloads).toBe(2);
  });

  it("refuses to run when it cannot read which files are already described", async () => {
    // An empty answer here would describe the whole backlog again.
    files = [png("FA", 1)];
    share(files[0]!, "1.0");
    storedUnreadable = true;
    await expect(describeSlackMedia(deps())).rejects.toThrow(/could not read/);
    expect(prompts).toHaveLength(0);
  });

  it("gives the model the image alone, in a folder of its own that is gone afterwards", async () => {
    files = [png("FA", 1)];
    share(files[0]!, "1.0");
    let folder = "";
    await describeSlackMedia(
      deps({
        describe: async (dir, prompt) => {
          folder = dir;
          expect(readdirSync(dir)).toEqual(["image.png"]);
          expect(prompt).toBe(`Describe the screenshot in ${join(dir, "image.png")}`);
          return { ok: true, text: "A screenshot.", truncated: false };
        },
      })
    );
    expect(folder).not.toBe("");
    expect(existsSync(folder)).toBe(false);
  });

  it("describes a recording from its frames, with the recording itself out of reach", async () => {
    files = [png("FV", 1, { filetype: "mp4", name: "ScreenRecording.MP4", size: 3_619_281 })];
    share(files[0]!, "1.0");
    downloadAs = { type: "video/mp4" };
    await describeSlackMedia(deps());
    expect(dirsSeen[0]).toEqual(["frame-1.jpg", "frame-2.jpg", "frame-3.jpg", "frame-4.jpg"]);
    expect(prompts[0]).toMatch(/4 images are frames from one screen recording of 15 seconds/);
    expect(prompts[0]).toContain("taken at 1.9s, 5.7s, 9.4s, 13.2s");
    expect(written[0]!.body).toContain("[screen recording: The LoveIQ report on a phone.]");
    expect(written[0]!.meta).toMatchObject({ media: "video" });
  });

  it("stops at the per-run cap, newest first, and leaves the rest for the next run", async () => {
    files = Array.from({ length: MAX_DESCRIPTIONS_PER_RUN + 5 }, (_, i) => png(`F${i}`, i));
    files.forEach((f) => share(f, `${f.created}.0`));
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ waiting: MAX_DESCRIPTIONS_PER_RUN + 5 });
    expect(result.described).toBe(MAX_DESCRIPTIONS_PER_RUN);
    expect(written[0]!.source_id).toBe(`file:F${MAX_DESCRIPTIONS_PER_RUN + 4}`);
  });

  it("starts no new file once the time budget is spent", async () => {
    files = [png("FA", 3), png("FB", 2), png("FC", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    const result = await describeSlackMedia(
      deps({
        describe: async () => {
          clock += RUN_BUDGET_MS / 2 + 1;
          return { ok: true, text: "A screenshot.", truncated: false };
        },
      })
    );
    expect(result.described).toBe(2);
    expect(result.error).toBeNull();
  });

  it("leaves a bot's upload alone, as the Slack walk does", async () => {
    files = [png("FA", 1)];
    share(files[0]!, "1.0");
    messages["1.0"] = { bot_id: "B1", text: "chart", ts: "1.0" };
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ skipped: 1, described: 0 });
    expect(downloads).toBe(0);
    expect(prompts).toHaveLength(0);
  });

  it("stops at the first refused download, and says what Slack needs", async () => {
    // Slack answers a download it will not authorise with its sign-in page.
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { type: "text/html; charset=utf-8" };
    const result = await describeSlackMedia(deps());
    expect(result.error).toMatch(/files:read/);
    expect(downloads).toBe(1);
    expect(prompts).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it("counts a file it could not fetch, and carries on with the next", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    let first = true;
    downloadAs = { status: 404, type: "text/plain" };
    const result = await describeSlackMedia(
      deps({
        describe: async () => {
          first = false;
          return { ok: true, text: "x", truncated: false };
        },
      })
    );
    expect(first).toBe(true);
    expect(result).toMatchObject({ failed: 2, described: 0, error: null });
  });

  it("stops for the day on a usage limit, and writes nothing for that file", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    answers = [
      { ok: false, reason: "rate_limited", detail: "You've hit your limit", dailyQuota: true },
    ];
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ limited: true, error: "You've hit your limit", described: 0 });
    expect(prompts).toHaveLength(1);
    expect(written).toHaveLength(0);
  });

  it("carries on past one failed answer, and stops after three in a row", async () => {
    files = Array.from({ length: 6 }, (_, i) => png(`F${i}`, 10 - i));
    files.forEach((f) => share(f, `${f.created}.0`));
    const failed: LlmResult = { ok: false, reason: "error", detail: "empty completion" };
    answers = [failed, { ok: true, text: "ok", truncated: false }, failed, failed, failed];
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ described: 1, failed: 4 });
    expect(result.error).toBe("the model failed 3 times in a row: empty completion");
    expect(prompts).toHaveLength(5);
  });
});
