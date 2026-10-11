import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const TEAM = "T0LOVEIQ";

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
  user_team?: string;
  channels?: string[];
  groups?: string[];
  ims?: string[];
}
let files: FakeFile[] = [];
type ShareMap = Record<string, Array<{ ts: string; thread_ts?: string }>>;
/** file id -> where it was shared: public channels and private ones, as files.info splits them. */
let shares: Record<string, { public?: ShareMap; private?: ShareMap }> = {};
/** message ts -> the message. */
let messages: Record<string, Record<string, unknown>> = {};
/** What a download answers, per file id (or for all files under "*"). */
let downloadAs: Record<string, { type?: string; status?: number; length?: number }> = {};
const downloaded: string[] = [];

const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
});

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    const u = new URL(url);
    if (u.pathname.startsWith("/files-pri/")) {
      // The token must only ever travel to Slack's own file host.
      expect(u.host).toBe("files.slack.com");
      expect(init?.headers?.Authorization).toBe("Bearer xoxb-test");
      const id = u.pathname.split("/")[2]!.split("-").pop()!;
      downloaded.push(id);
      const as = downloadAs[id] ?? downloadAs["*"] ?? { type: "image/png" };
      return answer(null, as.status ?? 200, {
        "content-type": as.type ?? "",
        ...(as.length !== undefined ? { "content-length": String(as.length) } : {}),
      });
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
            // Members, and never read: candidates and customer mail live here.
            { id: "C3", name: "hr", is_member: true, is_private: true },
            { id: "C5", name: "email-inbox", is_member: true, is_private: true },
            // Indexed, but its pictures are customers' payments: not described.
            { id: "C6", name: "payments", is_member: true },
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
        return answer({ ok: true, url: "https://loveiq.slack.com/", team_id: TEAM });
      case "files.info":
        return answer({ ok: true, file: { id: q("file"), shares: shares[q("file")] ?? {} } });
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

/**
 * brain_chunk, as far as this job reads it (the ids of files already described), and the
 * refusal log, where failed attempts are counted.
 */
const stored = new Set<string>();
let storedUnreadable = false;
const attemptLog = new Map<string, string>();
const mockSupabase = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  if (path.startsWith("/rest/v1/brain_refusal_log")) {
    expect(path).toContain("source");
    if (init?.method === "POST") {
      for (const r of JSON.parse(init.body ?? "[]") as Array<Record<string, string>>) {
        expect(r.source).toBe("slack-media");
        attemptLog.set(r.source_id!, r.version!);
      }
      return { ok: true, status: 201, json: async () => null };
    }
    expect(path).toContain("source=eq.slack-media");
    return {
      ok: true,
      status: 200,
      json: async () => [...attemptLog].map(([source_id, version]) => ({ source_id, version })),
    };
  }
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
  supabaseFetch: (path: string, init?: { method?: string; body?: string }) =>
    mockSupabase(path, init),
}));

import type { LlmResult } from "@features/brain/server/llm";
import {
  cleanDescription,
  describeArgs,
  describeSlackMedia,
  filesToDescribe,
  frameTimes,
  isDescription,
  isSlackFileUrl,
  MAX_ATTEMPTS,
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
  user_team: TEAM,
  channels: ["C1"],
  ...over,
});

/** A file shared by Marcus in a public channel, as its own message. */
function share(file: FakeFile, ts: string, text = "the report page is broken on my phone") {
  shares[file.id] = { public: { [file.channels?.[0] ?? "C1"]: [{ ts }] } };
  messages[ts] = { user: "U1", text, ts, files: [{ id: file.id, name: file.name }] };
}

const described = (text = "The LoveIQ report on a phone."): LlmResult => ({
  ok: true,
  text,
  truncated: false,
  turns: 2,
  denials: 0,
});

const written: BrainRow[] = [];
const prompts: string[] = [];
const dirsSeen: string[][] = [];
let answers: LlmResult[] = [];
let clock = 0;

const deps = (over: Partial<MediaDeps> & { limit?: number } = {}) => ({
  describe: async (dir: string, prompt: string) => {
    prompts.push(prompt);
    dirsSeen.push(readdirSync(dir).sort());
    return answers.shift() ?? described();
  },
  frames: async (_video: string, dir: string) => {
    const frames = [1.9, 5.7, 9.4, 13.2].map((at, i) => {
      const path = join(dir, `frame-${i + 1}.jpg`);
      writeFileSync(path, "jpg");
      return { path, at };
    });
    return { seconds: 15.1, frames };
  },
  write: async (rows: BrainRow[]) => {
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
  downloadAs = {};
  downloaded.length = 0;
  stored.clear();
  storedUnreadable = false;
  attemptLog.clear();
  written.length = 0;
  prompts.length = 0;
  dirsSeen.length = 0;
  answers = [];
  clock = 0;
});

describe("which files are described", () => {
  const channels = new Set(["C1", "C2"]);
  const file = (over: Partial<SlackFile>): SlackFile => ({ ...png("F0", 100), ...over });
  const pick = (list: SlackFile[], skip: Set<string> = new Set()) =>
    filesToDescribe(list, channels, skip, TEAM).map((f) => f.id);

  it("takes screenshots and recordings in the described channels, newest first", () => {
    expect(
      pick([
        file({ id: "F1", created: 100 }),
        file({ id: "F2", created: 300, filetype: "mp4", size: 3_600_000 }),
        file({ id: "F3", created: 200, filetype: "jpg", channels: [], groups: ["C2"] }),
      ])
    ).toEqual(["F2", "F3", "F1"]);
  });

  it("leaves out what the brain must not read or cannot", () => {
    expect(
      pick([
        file({ id: "keep", created: 1 }),
        // A DM, a denylisted or unjoined channel: not in the set described.
        file({ id: "dm", channels: [], groups: [] }),
        file({ id: "hr", channels: ["C3"] }),
        // Not a picture.
        file({ id: "pdf", filetype: "pdf", name: "deck.pdf" }),
        file({ id: "heic", filetype: "heic" }),
        file({ id: "proto", filetype: "constructor" }),
        // A link to a file elsewhere, and a deleted one.
        file({ id: "ext", mode: "external" }),
        file({ id: "gone", mode: "tombstone" }),
        file({ id: "nourl", url_private: undefined }),
        // The token goes to Slack's own file host only, over https.
        file({ id: "host", url_private: "https://evil.example/files-pri/T1-host/image.png" }),
        file({ id: "http", url_private: "http://files.slack.com/files-pri/T1-http/image.png" }),
        // Uploaded by someone in another workspace (a Slack Connect channel).
        file({ id: "elsewhere", user_team: "T0OTHER" }),
        file({ id: "big", size: 10_000_001 }),
        file({ id: "empty", size: 0 }),
        // The names every reader of a named file refuses (upsert.ts).
        file({ id: "cv", name: "CV_Jane_Doe.png" }),
        file({ id: "nda", name: "Confidentiality Agreement signed.png" }),
      ])
    ).toEqual(["keep"]);
  });

  it("never picks a file that already has a description, or was given up", () => {
    expect(pick([file({ id: "F1" }), file({ id: "F2" })], new Set(["F1"]))).toEqual(["F2"]);
  });

  it("allows a recording to be bigger than a screenshot, within a ceiling", () => {
    const mp4 = (size: number) => file({ id: `v${size}`, filetype: "mp4", size });
    expect(pick([mp4(17_900_000), mp4(50_000_001)])).toEqual(["v17900000"]);
  });

  it("knows Slack's file host from anything dressed as it", () => {
    expect(isSlackFileUrl("https://files.slack.com/files-pri/T1-F1/a.png")).toBe(true);
    expect(isSlackFileUrl("https://files.slack.com.evil.example/a.png")).toBe(false);
    expect(isSlackFileUrl("https://evil.example/?files.slack.com")).toBe(false);
    expect(isSlackFileUrl("not a url")).toBe(false);
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
});

describe("what a description may never carry", () => {
  it("replaces what personal data looks like, however the model wrote it", () => {
    expect(
      cleanDescription(
        "Rows show anna.k+test@gmail.com, jürgen @ müller.de and\n\nher answers. " +
          "Call +49 151 2345 6789 or 0151 23456789. Customer cus_Pq3rSt9uVwXy paid pi_3NkAbC12dEf, " +
          "session cs_live_a1B2c3D4e5F6. Seen from 192.168.10.24 and 2001:0db8:85a3:0000:0000:8a2e:0370:7334."
      )
    ).toBe(
      "Rows show [email], [email] and her answers. Call [phone] or [phone]. Customer [id] paid [id], " +
        "session [id]. Seen from [ip] and [ip]."
    );
  });

  it("leaves dates, times, prices, counts and status words alone", () => {
    const plain =
      "Created 05/10/2026 and 2026-10-09 at 21:30:00, frame at 00:15:11, €6.99 not 4,99 €, " +
      "1,234 visits, 30% off, v2.1.296, status in_progress, @Eman asked.";
    expect(cleanDescription(plain)).toBe(plain);
  });

  it("is one bounded line", () => {
    expect(cleanDescription("x ".repeat(2_000)).length).toBe(1_200);
  });
});

describe("what counts as a description", () => {
  it("is an answer that read the files and was refused nothing", () => {
    expect(isDescription(described())).toBe(true);
    // Never used the Read tool, or the CLI did not say.
    expect(isDescription({ ...described(), turns: 1 })).toBe(false);
    expect(isDescription({ ok: true, text: "A report page.", truncated: false })).toBe(false);
    // Tried to read something else: a picture that talks the model into it is not stored.
    expect(isDescription({ ...described(), denials: 1 })).toBe(false);
  });

  it("is not the model saying it could not see them", () => {
    expect(isDescription(described("UNREADABLE"))).toBe(false);
    expect(isDescription(described("I can't read the file at that path."))).toBe(false);
    expect(isDescription(described("I was unable to open the image."))).toBe(false);
    expect(isDescription(described("   "))).toBe(false);
    // Error text quoted from a screenshot is still a description.
    expect(
      isDescription(described('The console shows "Cannot read properties of undefined".'))
    ).toBe(true);
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
    const rules = args[args.indexOf("--system-prompt") + 1];
    expect(rules).toMatch(/Never write down anyone's personal data, whoever it belongs to/);
    expect(rules).toMatch(/Personal data comes before quoting exactly/);
    expect(rules).toMatch(/reply with exactly UNREADABLE/);
    // Measured 2026-10-11: without this, one person's report scores were copied out.
    expect(rules).toMatch(/One person's results are personal data too, even with no name/);
  });
});

describe("describeSlackMedia", () => {
  it("describes each waiting file once, and a second run describes nothing", async () => {
    const a = png("FA", 1_791_380_415);
    const b = png("FB", 1_791_574_369, { channels: [], groups: ["C2"] });
    files = [a, b];
    share(a, "1791380415.842289");
    // Shared with no caption, in a private channel: files.info lists it under `private`.
    shares[b.id] = { private: { C2: [{ ts: "1791574369.704089" }] } };
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
    expect(second).toMatchObject({ waiting: 0, described: 0, error: null });
    expect(prompts).toHaveLength(2);
    expect(downloaded).toEqual(["FB", "FA"]);
  });

  it("never opens a file from #hr, #email-inbox or #payments, though the bot is in them", async () => {
    files = [
      png("FH", 3, { channels: [], groups: ["C3"] }),
      png("FE", 2, { channels: [], groups: ["C5"] }),
      png("FP", 1, { channels: ["C6"] }),
    ];
    shares.FH = { private: { C3: [{ ts: "3.0" }] } };
    shares.FE = { private: { C5: [{ ts: "2.0" }] } };
    share(files[2]!, "1.0");
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ waiting: 0, described: 0, error: null });
    expect(downloaded).toEqual([]);
  });

  it("leaves alone a message from another workspace, in a shared channel", async () => {
    files = [png("FX", 1)];
    share(files[0]!, "1.0");
    messages["1.0"]!.user_team = "T0OTHER";
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ skipped: 1, described: 0 });
    expect(downloaded).toEqual([]);
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
          return described("A screenshot.");
        },
      })
    );
    expect(folder).not.toBe("");
    expect(existsSync(folder)).toBe(false);
  });

  it("describes a recording from its frames, with the recording itself out of reach", async () => {
    files = [png("FV", 1, { filetype: "mp4", name: "ScreenRecording.MP4", size: 3_619_281 })];
    share(files[0]!, "1.0");
    downloadAs = { FV: { type: "video/mp4" } };
    await describeSlackMedia(deps());
    expect(dirsSeen[0]).toEqual(["frame-1.jpg", "frame-2.jpg", "frame-3.jpg", "frame-4.jpg"]);
    expect(prompts[0]).toMatch(/4 images are frames from one screen recording of 15 seconds/);
    expect(prompts[0]).toContain("taken at 1.9s, 5.7s, 9.4s, 13.2s");
    expect(written[0]!.body).toContain("[screen recording: The LoveIQ report on a phone.]");
    expect(written[0]!.meta).toMatchObject({ media: "video" });
  });

  it("shows the model only the frames that exist and hold something", async () => {
    files = [png("FV", 1, { filetype: "mp4", name: "ScreenRecording.MP4", size: 3_619_281 })];
    share(files[0]!, "1.0");
    downloadAs = { FV: { type: "video/mp4" } };
    await describeSlackMedia(
      deps({
        frames: async (_video, dir) => {
          writeFileSync(join(dir, "frame-1.jpg"), "jpg");
          writeFileSync(join(dir, "frame-2.jpg"), "");
          return {
            seconds: 15.1,
            frames: [1.9, 5.7, 9.4].map((at, i) => ({ path: join(dir, `frame-${i + 1}.jpg`), at })),
          };
        },
      })
    );
    expect(prompts[0]).toMatch(
      /^These 1 images are frames .* taken at 1\.9s:\n[^\n]*frame-1\.jpg\n/
    );
  });

  it("stops at once, and says so, when ffmpeg is missing", async () => {
    files = [png("FV", 2, { filetype: "mp4", size: 3_619_281 }), png("FA", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { FV: { type: "video/mp4" } };
    const result = await describeSlackMedia(
      deps({
        frames: async () => {
          throw Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
        },
      })
    );
    expect(result.error).toBe("ffmpeg is not installed");
    expect(prompts).toHaveLength(0);
    expect(attemptLog.size).toBe(0);
  });

  it("stops at the per-run cap, newest first, and leaves the rest for the next run", async () => {
    files = Array.from({ length: MAX_DESCRIPTIONS_PER_RUN + 5 }, (_, i) => png(`F${i}`, i));
    files.forEach((f) => share(f, `${f.created}.0`));
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ waiting: MAX_DESCRIPTIONS_PER_RUN + 5 });
    expect(result.described).toBe(MAX_DESCRIPTIONS_PER_RUN);
    expect(written[0]!.source_id).toBe(`file:F${MAX_DESCRIPTIONS_PER_RUN + 4}`);
  });

  it("describes fewer when asked to, as the 05:41 run is", async () => {
    files = Array.from({ length: 5 }, (_, i) => png(`F${i}`, i));
    files.forEach((f) => share(f, `${f.created}.0`));
    expect((await describeSlackMedia(deps({ limit: 3 }))).described).toBe(3);
  });

  it("starts no new file once the time budget is spent", async () => {
    files = [png("FA", 3), png("FB", 2), png("FC", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    const result = await describeSlackMedia(
      deps({
        describe: async () => {
          clock += RUN_BUDGET_MS / 2 + 1;
          return described("A screenshot.");
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
    expect(result).toMatchObject({ skipped: 1, described: 0, error: null });
    expect(downloaded).toEqual([]);
    expect(prompts).toHaveLength(0);
  });

  it("stops when two different files are refused in a row, and blames neither", async () => {
    // Slack answers a download it will not authorise with its sign-in page.
    files = [png("FA", 3), png("FB", 2), png("FC", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { "*": { type: "text/html; charset=utf-8" } };
    const result = await describeSlackMedia(deps());
    expect(result.error).toMatch(/two downloads in a row.*files:read/);
    expect(downloaded).toEqual(["FA", "FB"]);
    expect(prompts).toHaveLength(0);
    expect(attemptLog.size).toBe(0);
  });

  it("counts one refused file against it when the next download works", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { FA: { status: 403, type: "text/html" } };
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ described: 1, failed: 1, error: null });
    expect(attemptLog.get("FA")).toBe("1");
  });

  it("reads a 404 page as a file that is gone, not as a missing scope", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { "*": { status: 404, type: "text/html; charset=utf-8" } };
    const result = await describeSlackMedia(deps());
    expect(result.error).not.toMatch(/files:read/);
    expect(result).toMatchObject({ failed: 2, described: 0 });
    expect([...attemptLog.keys()].sort()).toEqual(["FA", "FB"]);
  });

  it("fails a run that tried files and described none, so it alerts", async () => {
    files = [png("FA", 1)];
    share(files[0]!, "1.0");
    downloadAs = { FA: { status: 404, type: "text/plain" } };
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ failed: 1, described: 0 });
    expect(result.error).toBe("nothing was described and 1 failed");
  });

  it("refuses a file whose download is bigger than the ceiling", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    downloadAs = { FA: { type: "image/png", length: 10_000_001 } };
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ described: 1, failed: 1 });
    expect(written.map((r) => r.source_id)).toEqual(["file:FB"]);
  });

  it("leaves a file alone after it failed in MAX_ATTEMPTS runs, so it cannot block the rest", async () => {
    files = [png("BAD", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    for (let run = 1; run <= MAX_ATTEMPTS; run += 1) {
      answers = [described("UNREADABLE")];
      const result = await describeSlackMedia(deps());
      expect(attemptLog.get("BAD")).toBe(String(run));
      // A file that fails for reasons of its own never stops the run.
      expect(result.error).toBeNull();
      stored.delete("file:FB");
    }
    const after = await describeSlackMedia(deps());
    expect(after).toMatchObject({ givenUp: 1, waiting: 1, described: 1 });
    expect(prompts.filter((p) => p.includes("image.png"))).toHaveLength(MAX_ATTEMPTS * 2 + 1);
    expect(written.every((r) => r.source_id !== "file:BAD")).toBe(true);
  });

  it("blames no file when every one failed in a run, since one broken thing is likelier", async () => {
    files = Array.from({ length: 4 }, (_, i) => png(`F${i}`, i));
    files.forEach((f) => share(f, `${f.created}.0`));
    answers = Array.from({ length: 4 }, () => ({ ...described(), turns: 1 }));
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ described: 0, failed: 4 });
    expect(result.error).toMatch(/nothing was described/);
    expect(attemptLog.size).toBe(0);
  });

  it("stops for the day on a usage limit, and blames no file", async () => {
    files = [png("FA", 2), png("FB", 1)];
    files.forEach((f) => share(f, `${f.created}.0`));
    answers = [
      { ok: false, reason: "rate_limited", detail: "You've hit your limit", dailyQuota: true },
    ];
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ limited: true, error: "You've hit your limit", described: 0 });
    expect(prompts).toHaveLength(1);
    expect(written).toHaveLength(0);
    expect(attemptLog.size).toBe(0);
  });

  it("stops when the pipeline fails three times in a row, but not for a file's own failure", async () => {
    files = Array.from({ length: 7 }, (_, i) => png(`F${i}`, 10 - i));
    files.forEach((f) => share(f, `${f.created}.0`));
    const signedOut: LlmResult = { ok: false, reason: "error", detail: "Not logged in" };
    const timedOut: LlmResult = {
      ok: false,
      reason: "error",
      detail: "no answer within 120000 ms",
    };
    answers = [signedOut, described("ok"), timedOut, signedOut, signedOut, signedOut];
    const result = await describeSlackMedia(deps());
    expect(result).toMatchObject({ described: 1, failed: 5 });
    expect(result.error).toBe("the pipeline failed 3 times in a row: Not logged in");
    expect(prompts).toHaveLength(6);
    // The timeout is the file's; signed out is nobody's file.
    expect([...attemptLog.keys()]).toEqual(["F2"]);
  });
});
