import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock("@features/brain/server/ingest/gmail", () => ({
  ingestGmail: (...a: unknown[]) => mockIngest(...(a as [])),
}));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));
vi.mock("@shared/http/vercel-oidc", () => ({ readVercelOidcToken: () => null }));

let authOk = true;
const recorded: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  startCronTimer: () => async () => {},
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    recorded.push({ name, status, error });
  },
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));

const notified: Array<{ channel: string; text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { channel: string; text: string }) => {
    notified.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { ingestNote } from "@features/brain/server/ingest/upsert";
import { GET } from "@/app/api/cron/brain-gmail/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-gmail");

describe("/api/cron/brain-gmail records WHY, not just whether", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorded.length = 0;
    notified.length = 0;
    authOk = true;
    prodHost = true;
  });

  it("records the walk detail even when the skip is deliberate and nothing alerts", async () => {
    /**
     * THE REGRESSION THIS EXISTS FOR.
     *
     * `gmail-walk-in-progress` is in DELIBERATE_SKIPS, so it reports success and
     * never alerts — correct, a converging re-walk is not a fault. But it also left
     * `error_message` empty, which made a walk that has NEVER completed byte-identical
     * in `cron_run` to a healthy one.
     *
     * Measured 2026-09-06: `brain_sweep_state` had no gmail row at all — not one
     * completed walk, ever — across 24 consecutive runs that every one recorded
     * `success` with no message. The diagnosis existed the whole time and went only
     * to a log stream that cannot be queried after the fact.
     */
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 12,
      swept: 0,
      skipped: "gmail-walk-in-progress",
      complete: false,
      detail:
        "boxes=7 listed=3918 fetched=120 written=12 complete=false stopped=time-budget@ec@loveiq.org:p9",
    });
    await GET(req());
    expect(recorded).toHaveLength(1);
    // Still success: a converging walk must not be loud.
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(0);
    // ...but no longer silent about what it saw.
    expect(recorded[0]!.error).toMatch(/stopped=time-budget@ec@loveiq\.org:p9/);
  });

  it("keeps the detail alongside the skip name when the skip IS a fault", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 0,
      swept: 0,
      skipped: "gmail-walk-incomplete",
      complete: false,
      detail: "boxes=7 listed=0 stopped=listing-refused@ec@loveiq.org:p0",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(recorded[0]!.error).toMatch(/gmail-walk-incomplete/);
    expect(recorded[0]!.error).toMatch(/stopped=listing-refused/);
    expect(notified).toHaveLength(1);
  });

  it("records the detail on a fully healthy run too", async () => {
    // Otherwise "no message" would still be ambiguous between healthy and unreported.
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 9000,
      swept: 4,
      complete: true,
      detail: "boxes=7 listed=3918 fetched=30 written=30 swept=4 complete=true",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
    expect(recorded[0]!.error).toMatch(/complete=true/);
  });

  /**
   * A PARTIAL WALK IS NOT A SKIP, and until 2026-09-07 it was not anything at all.
   *
   * `result.complete` was computed, recorded, and branched on in NO cron route. The
   * cost is specific: `sweepMissing` only runs after a walk that finished, so a
   * permanently incomplete walk silently disables deletion for that source. Measured
   * the same day, brain-drive had reported `complete=false swept=0` on 21 of 21 runs
   * since the note was added the day before, and nothing said a word.
   */
  it("alerts when the walk finished only part of the mailbox", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 40,
      swept: 0,
      complete: false,
      detail: "boxes=9 listed=3769 fetched=176 written=40 swept=0 complete=false",
    });
    await GET(req());
    // Not a failure — it indexed real work, and `status` must stay success or the
    // alert becomes indistinguishable from an outage.
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.text).toMatch(/walked only part/);
    // The consequence, not just the fact — a reader needs to know deletions stopped.
    expect(notified[0]!.text).toMatch(/sweep only runs after a complete walk/);
  });

  /**
   * INCOMPLETE IS NOT THE SAME AS "DELETIONS ARE BROKEN", and keying the alert on the
   * wrong one of those raised a false alarm within a day of shipping it. Drive gates
   * its sweep on the LISTING, so a failed export leaves it sweeping normally while
   * reporting `complete=false` — and the alert said deletions had stopped.
   */
  it("says nothing when the walk was incomplete but the sweep still ran", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 40,
      swept: 2,
      complete: false,
      sweepBlocked: false,
      detail: "complete=false stopped=export-failed",
    });
    await GET(req());
    expect(notified).toHaveLength(0);
  });

  it("says nothing when the walk completed", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 9000,
      swept: 4,
      complete: true,
      detail: "complete=true",
    });
    await GET(req());
    expect(notified).toHaveLength(0);
  });

  /**
   * The skip branch has already spoken, and a run that never walked has no
   * completeness worth reporting. Two alerts for one event trains people to ignore
   * both.
   */
  it("does not add an incompleteness alert on top of a skip", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 0,
      swept: 0,
      skipped: "gmail-walk-incomplete",
      complete: false,
      detail: "stopped=listing-refused",
    });
    await GET(req());
    expect(notified).toHaveLength(1);
    expect(notified[0]!.text).not.toMatch(/walked only part/);
  });

  /**
   * A REVOKED CREDENTIAL IS A FAULT, NOT A CONFIGURATION CHOICE.
   *
   * `google-token-unavailable` sat in DELIBERATE_SKIPS for gmail, drive AND calendar,
   * so the single most likely way for three sources to go dark at once was also the
   * quietest. `brain-ingest` documents the opposite policy in as many words. The three
   * lists now match the policy.
   */
  it("alerts when the Google credential is unavailable", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 0,
      swept: 0,
      skipped: "google-token-unavailable",
      detail: "rows=0 swept=0",
    });
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.text).toMatch(/google-token-unavailable/);
  });

  it("still says nothing when Google was simply never configured", async () => {
    mockIngest.mockResolvedValue({
      source: "gmail",
      rows: 0,
      swept: 0,
      skipped: "gmail-nothing-to-index",
      detail: "rows=0 swept=0",
    });
    await GET(req());
    expect(notified).toHaveLength(0);
  });
});

describe("ingestNote — the line every brain lane leaves behind", () => {
  /**
   * Four routes had the identical defect and only gmail's cost anything visible, so
   * the rule lives in one function rather than four copies of a habit.
   */
  it("says whether the run finished, which is the whole point of the field", () => {
    expect(ingestNote({ source: "drive", rows: 3, swept: 0, complete: false })).toBe(
      "rows=3 swept=0 complete=false"
    );
    expect(ingestNote({ source: "drive", rows: 700, swept: 2, complete: true })).toBe(
      "rows=700 swept=2 complete=true"
    );
  });

  it("distinguishes a lane that does not report completeness from one that says false", () => {
    // `complete` is optional; omitting it must not read as "did not finish".
    expect(ingestNote({ source: "slack", rows: 5, swept: 0 })).toBe("rows=5 swept=0");
  });

  it("keeps the skip reason, which is what a person actually searches for", () => {
    expect(
      ingestNote({
        source: "notion",
        rows: 0,
        swept: 0,
        complete: false,
        skipped: "notion-crawl-truncated",
      })
    ).toMatch(/skipped=notion-crawl-truncated/);
  });

  it("prefers a lane's own detail when it has one", () => {
    // gmail builds a far richer line; the generic shape must not overwrite it.
    expect(
      ingestNote({ source: "gmail", rows: 1, swept: 0, detail: "stopped=page-cap@ec@loveiq.org" })
    ).toBe("stopped=page-cap@ec@loveiq.org");
  });
});
