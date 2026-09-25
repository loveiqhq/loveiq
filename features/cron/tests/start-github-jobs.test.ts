/**
 * Vercel's clock for the GitHub jobs GitHub's own schedule no longer starts on time.
 *
 * Two halves: WHEN each job is due (jobsDue, pure) and WHETHER the route asked GitHub for
 * each one and says so when GitHub refused (the route, with fetch mocked). A third check
 * reads the workflows, because an input the workflow does not declare is a 422 from
 * GitHub and a job that silently never starts.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { CLOCK_WORKFLOWS, jobsDue } from "@features/cron/server/github-jobs";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: log }));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));

let authOk = true;
const runs: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    runs.push({ name, status, error });
  },
}));

const fetchMock = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => fetchMock(...a),
}));

import { GET } from "@/app/api/cron/start-github-jobs/route";

// 2026-09-28 is a Monday.
const at = (iso: string) => new Date(iso);
const workflows = (iso: string) => jobsDue(at(iso)).map((j) => j.workflow);
const req = () => new Request("https://www.loveiq.org/api/cron/start-github-jobs");
const answer = (status: number, body = "") =>
  ({ status, text: async () => body }) as unknown as Response;

describe("when each GitHub job is due", () => {
  it("starts the verifier every hour, marked as the clock's run", () => {
    for (let h = 0; h < 24; h += 1) {
      const hh = String(h).padStart(2, "0");
      const v = jobsDue(at(`2026-09-29T${hh}:41:00Z`)).find(
        (j) => j.workflow === "ux-review-verify.yml"
      );
      expect(v?.inputs, `hour ${h}`).toEqual({ on_time: "true" });
    }
  });

  it("scores the scanners once a week, Mondays at 10:41", () => {
    const monday10 = jobsDue(at("2026-09-28T10:41:00Z"));
    expect(monday10.find((j) => j.workflow === "ux-review-verify.yml")?.inputs).toEqual({
      on_time: "true",
      weekly: "true",
    });
    const tuesday10 = jobsDue(at("2026-09-29T10:41:00Z"));
    expect(tuesday10.find((j) => j.workflow === "ux-review-verify.yml")?.inputs).toEqual({
      on_time: "true",
    });
  });

  it("starts the morning jobs in their own hour, and only then", () => {
    expect(workflows("2026-09-29T05:41:00Z")).toContain("probe-guard.yml");
    expect(
      jobsDue(at("2026-09-29T05:41:00Z")).find((j) => j.workflow === "probe-guard.yml")?.inputs
    ).toEqual({ which: "daily" });
    expect(workflows("2026-09-29T07:41:00Z")).toContain("survey-db-sync.yml");
    expect(workflows("2026-09-29T08:41:00Z")).toEqual(
      expect.arrayContaining(["health-monitor.yml", "ux-digest-audit.yml"])
    );
    expect(workflows("2026-09-29T10:41:00Z")).toContain("ux-digest-audit.yml");
    // A quiet hour starts the verifier and nothing else.
    expect(workflows("2026-09-29T15:41:00Z")).toEqual(["ux-review-verify.yml"]);
  });

  it("runs the heavy weekly probes on Monday at 04:41, not every day", () => {
    const monday4 = jobsDue(at("2026-09-28T04:41:00Z")).find(
      (j) => j.workflow === "probe-guard.yml"
    );
    expect(monday4?.inputs).toEqual({ which: "weekly" });
    expect(workflows("2026-09-29T04:41:00Z")).not.toContain("probe-guard.yml");
  });

  it("starts the digest audit after the digest in winter as well as summer", () => {
    // The digest posts at 08:17 UTC in winter; the audit's first start must be later.
    const hours = [...Array(24).keys()].filter((h) =>
      workflows(`2026-12-01T${String(h).padStart(2, "0")}:41:00Z`).includes("ux-digest-audit.yml")
    );
    expect(Math.min(...hours) * 60 + 41).toBeGreaterThan(8 * 60 + 17);
  });
});

describe("the workflows the clock starts", () => {
  type Wf = { on?: Record<string, unknown>; [k: string]: unknown };
  const load = (file: string) => {
    const doc = parse(readFileSync(`.github/workflows/${file}`, "utf8")) as Wf;
    // YAML 1.1 reads a bare `on:` key as the boolean true.
    return (doc.on ?? (doc as Record<string, unknown>)["true"]) as Record<string, unknown>;
  };

  it.each(CLOCK_WORKFLOWS.map((w) => [w]))(
    "%s can be started by the clock, and GitHub cannot start a late copy",
    (file) => {
      const on = load(file);
      expect(on, "no `schedule:`: GitHub would start a late duplicate").not.toHaveProperty(
        "schedule"
      );
      expect(on).toHaveProperty("workflow_dispatch");
    }
  );

  it("declares every input the clock sends, at any hour of any day", () => {
    for (let d = 0; d < 7; d += 1) {
      for (let h = 0; h < 24; h += 1) {
        const when = new Date(Date.UTC(2026, 8, 28 + d, h, 41));
        for (const job of jobsDue(when)) {
          const dispatch = load(job.workflow).workflow_dispatch as {
            inputs?: Record<string, unknown>;
          } | null;
          for (const key of Object.keys(job.inputs ?? {})) {
            expect(
              Object.keys(dispatch?.inputs ?? {}),
              `${job.workflow} at ${when.toISOString()}`
            ).toContain(key);
          }
        }
      }
    }
  });

  it("is started by a cron that exists, every hour at :41", () => {
    const crons = (
      JSON.parse(readFileSync("vercel.json", "utf8")) as {
        crons: Array<{ path: string; schedule: string }>;
      }
    ).crons;
    expect(crons).toContainEqual({ path: "/api/cron/start-github-jobs", schedule: "41 * * * *" });
  });
});

describe("the route that starts them", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runs.length = 0;
    authOk = true;
    prodHost = true;
    process.env.GITHUB_DISPATCH_TOKEN = "test-token";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T08:41:05Z"));
  });

  it("refuses a caller without the cron secret", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing on the staging project, which runs the same crons", async () => {
    prodHost = false;
    expect((await (await GET(req())).json()).skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks GitHub for each job due this hour, on main, with its inputs", async () => {
    fetchMock.mockResolvedValue(answer(204));
    const body = await (await GET(req())).json();
    const due = jobsDue(new Date("2026-09-29T08:41:05Z"));
    expect(body.started).toBe(due.length);
    expect(fetchMock).toHaveBeenCalledTimes(due.length);
    for (const [i, job] of due.entries()) {
      const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
      expect(url).toBe(
        `https://api.github.com/repos/loveiqhq/loveiq/actions/workflows/${job.workflow}/dispatches`
      );
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: job.inputs ?? {} });
    }
    expect(runs).toEqual([{ name: "start-github-jobs", status: "success", error: undefined }]);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("says so when GitHub refuses a start, and still asks for the rest", async () => {
    fetchMock
      .mockResolvedValueOnce(answer(403, '{"message":"Resource not accessible"}'))
      .mockResolvedValue(answer(204));
    const body = await (await GET(req())).json();
    const due = jobsDue(new Date("2026-09-29T08:41:05Z"));
    expect(fetchMock).toHaveBeenCalledTimes(due.length);
    expect(body.started).toBe(due.length - 1);
    expect(body.failed[0]).toMatch(/^ux-review-verify\.yml: 403/);
    expect(runs[0]?.status).toBe("error");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("counts a network failure as a refused start", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(answer(204));
    const body = await (await GET(req())).json();
    expect(body.failed).toEqual(["ux-review-verify.yml: timeout"]);
    expect(runs[0]?.status).toBe("error");
  });

  it("reports a missing token instead of quietly starting nothing", async () => {
    delete process.env.GITHUB_DISPATCH_TOKEN;
    const body = await (await GET(req())).json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.started).toBe(0);
    expect(runs[0]).toEqual({
      name: "start-github-jobs",
      status: "error",
      error: "GITHUB_DISPATCH_TOKEN is not set",
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
