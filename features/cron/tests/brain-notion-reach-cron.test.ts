import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogError = vi.fn();
vi.mock("@shared/observability/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: (...a: unknown[]) => mockLogError(...a),
    debug: vi.fn(),
  },
}));

const mockRecordCronRun = vi.fn();
const mockClaim = vi.fn(async () => true);
const mockDelivered = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (req: Request) => req.headers.get("authorization") === "Bearer s",
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
  startCronTimer: () => async () => undefined,
  tryClaimSlackAlert: (...a: unknown[]) => mockClaim(...(a as [])),
  markSlackAlertDelivered: (...a: unknown[]) => mockDelivered(...a),
}));

const mockSlack = vi.fn();
vi.mock("@shared/observability/slack", async (orig) => ({
  ...(await orig<typeof import("@shared/observability/slack")>()),
  notifySlack: (...a: unknown[]) => mockSlack(...a),
}));

const mockProdHost = vi.fn(() => true);
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => mockProdHost() }));

const mockCheck = vi.fn();
vi.mock("@features/brain/server/notion-reach", () => ({
  checkNotionReach: (...a: unknown[]) => mockCheck(...a),
}));

import { GET } from "@/app/api/cron/brain-notion-reach/route";
import { reportingDay } from "@shared/time/reporting-day";

const call = (auth = "Bearer s") =>
  GET(
    new Request("https://loveiq.org/api/cron/brain-notion-reach", {
      headers: { authorization: auth },
    })
  );

const result = (over: Record<string, unknown> = {}) => ({
  linked: 82,
  checked: 19,
  missing: 4,
  fresh: 4,
  fixed: 0,
  unknown: 0,
  unreached: 0,
  trashed: 0,
  visibleNotIndexed: 15,
  mentionPages: 4,
  mentionTotal: 4,
  problem: null,
  findingKey: "abcdef0123",
  seenRefreshFailed: false,
  noticed: true,
  noticeFailed: false,
  summary: "4 linked Notion pages Jarvis cannot open (Email Marketing Playbook, …)",
  notice: null,
  ...over,
});

describe("GET /api/cron/brain-notion-reach", () => {
  beforeEach(() => {
    mockRecordCronRun.mockReset();
    mockLogError.mockReset();
    mockSlack.mockReset();
    mockDelivered.mockReset();
    mockClaim.mockReset().mockResolvedValue(true);
    mockCheck.mockReset().mockResolvedValue(result());
    mockProdHost.mockReturnValue(true);
  });

  it("refuses without the cron bearer, and does nothing off production", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    mockProdHost.mockReturnValue(false);
    expect(await (await call()).json()).toMatchObject({ skipped: true });
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("records the summary sentence first, so list_sources can show it beside Notion", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const [name, , status, detail] = mockRecordCronRun.mock.calls[0] as [
      string,
      number,
      string,
      string,
    ];
    expect(name).toBe("brain-notion-reach");
    expect(status).toBe("success");
    expect(detail.split(" · ")[0]).toBe(
      "4 linked Notion pages Jarvis cannot open (Email Marketing Playbook, …)"
    );
    expect(detail).toContain(
      "not reached 0, in trash 0, visible not yet indexed 15, mention pages 4/4"
    );
  });

  it("gives the check a clock that runs out at 60 s, well before the 120 s kill", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-12T05:20:00Z"));
      await call();
      const isOutOfTime = mockCheck.mock.calls[0]![1] as () => boolean;
      vi.setSystemTime(new Date("2026-10-12T05:20:59Z"));
      expect(isOutOfTime()).toBe(false);
      vi.setSystemTime(new Date("2026-10-12T05:21:01Z"));
      expect(isOutOfTime()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails loudly when a notice was due and could not be written", async () => {
    mockCheck.mockResolvedValue(result({ noticed: false, noticeFailed: true }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    // `brain …` routes the alert to the brain channel; a cron_run row alone tells nobody.
    expect(String(mockLogError.mock.calls[0]![1])).toMatch(/^brain notion-reach/);
  });

  it("posts a due notice to the brain channel once per finding per day, escaped", async () => {
    const notice = {
      headline: "Jarvis cannot open 1 Notion page the team links to",
      detail:
        'New since the last check:\n• "R&D <draft>", linked in Slack: https://www.notion.so/x',
      kind: "notion-reach",
    };
    mockCheck.mockResolvedValue(result({ notice }));
    await call();
    const [key, scope, day] = mockClaim.mock.calls[0] as unknown as [string, string, string];
    // The finding's own key (its pages), so a same-day re-run of the same news is one post.
    expect(key).toBe("brain_notion_reach:abcdef0123");
    expect([scope, day]).toEqual(["day", reportingDay(new Date())]);
    const post = mockSlack.mock.calls[0]![0] as { channel: string; text: string };
    expect(post.channel).toBe("brain");
    expect(post.text).toContain("*Jarvis cannot open 1 Notion page the team links to*");
    expect(post.text).toContain("R&amp;D &lt;draft&gt;");
    expect(mockDelivered).toHaveBeenCalledWith(key, "day", day);

    // Already posted today (a re-run): no second post.
    mockSlack.mockReset();
    mockClaim.mockResolvedValue(false);
    await call();
    expect(mockSlack).not.toHaveBeenCalled();
  });

  it("posts a second, different finding the same day even under the same headline", async () => {
    const headline = "Jarvis can now open 1 Notion page it could not before";
    mockCheck.mockResolvedValueOnce(
      result({
        notice: { headline, detail: "• X", kind: "notion-reach" },
        findingKey: "x000000000",
      })
    );
    await call();
    mockCheck.mockResolvedValueOnce(
      result({
        notice: { headline, detail: "• Y", kind: "notion-reach" },
        findingKey: "y000000000",
      })
    );
    await call();
    const keys = mockClaim.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("posts nothing on a day with nothing to say", async () => {
    await call();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSlack).not.toHaveBeenCalled();
  });

  it("fails a run that could not do its job instead of calling it clean", async () => {
    mockCheck.mockResolvedValue(
      result({ problem: "Notion answered none of the 71 questions it was asked" })
    );
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    expect(mockRecordCronRun.mock.calls[0]![3]).toMatch(/^Notion answered none of the 71/);
    expect(String(mockLogError.mock.calls[0]![1])).toBe(
      "brain notion-reach: Notion answered none of the 71 questions it was asked"
    );
  });

  it("fails a run whose last-seen days could not be saved", async () => {
    mockCheck.mockResolvedValue(result({ seenRefreshFailed: true }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    expect(String(mockLogError.mock.calls[0]![1])).toBe(
      "brain notion-reach: the reported pages' last-seen days could not be saved"
    );
  });

  it("records a failed run when the check throws", async () => {
    mockCheck.mockRejectedValue(new Error("brain-ingest notion-reach: could not read"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    expect(mockRecordCronRun.mock.calls[0]![3]).toContain("could not read");
    expect(String(mockLogError.mock.calls[0]![1])).toMatch(/^brain notion-reach/);
  });
});
