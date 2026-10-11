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
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (req: Request) => req.headers.get("authorization") === "Bearer s",
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
}));

const mockProdHost = vi.fn(() => true);
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => mockProdHost() }));

const mockCheck = vi.fn();
vi.mock("@features/brain/server/notion-reach", () => ({
  checkNotionReach: (...a: unknown[]) => mockCheck(...a),
}));

import { GET } from "@/app/api/cron/brain-notion-reach/route";

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
  visibleNotIndexed: 15,
  mentionPages: 4,
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
    expect(detail).toContain("visible not yet indexed 15");
  });

  it("gives the check a clock that runs out before the function is killed", async () => {
    await call();
    const isOutOfTime = mockCheck.mock.calls[0]![1] as () => boolean;
    expect(isOutOfTime()).toBe(false);
  });

  it("fails loudly when a notice was due and could not be written", async () => {
    mockCheck.mockResolvedValue(result({ noticed: false, noticeFailed: true }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(mockRecordCronRun.mock.calls[0]![2]).toBe("error");
    // `brain …` routes the alert to the brain channel; a cron_run row alone tells nobody.
    expect(String(mockLogError.mock.calls[0]![1])).toMatch(/^brain notion-reach/);
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
