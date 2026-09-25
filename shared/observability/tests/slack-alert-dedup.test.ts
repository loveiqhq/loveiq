/**
 * A failed claim drops the alert it was claiming for.
 *
 * tryClaimSlackAlert answers false both when another caller holds the slot (the
 * point of it) and when the claim table could not be asked. The second case was
 * logged at warn, which reaches no one, so a broken claim table would have
 * silenced every deduped alert at once: stalls, anomalies, the digests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => fetchMock(...a),
}));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: log }));

import { tryClaimSlackAlert } from "@shared/observability/slack-alert-dedup";

const answer = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

describe("claiming an alert slot", () => {
  it("is granted when the table says so", async () => {
    fetchMock.mockResolvedValue(answer(200, true));
    expect(await tryClaimSlackAlert("cron_stalled:x", "day", "2026-09-25")).toBe(true);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("is refused quietly when another caller holds the slot", async () => {
    fetchMock.mockResolvedValue(answer(200, false));
    expect(await tryClaimSlackAlert("cron_stalled:x", "day", "2026-09-25")).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("reports a claim the table refused to answer, since the alert is dropped", async () => {
    fetchMock.mockResolvedValue(answer(401, { message: "Invalid API key" }));
    expect(await tryClaimSlackAlert("cron_stalled:x", "day", "2026-09-25")).toBe(false);
    expect(log.error).toHaveBeenCalledTimes(1);
    // Slack keeps only allowlisted context keys, so the message itself names the alert.
    expect(log.error.mock.calls[0]?.[1]).toBe(
      "tryClaimSlackAlert: RPC non-2xx, so the cron_stalled:x alert was dropped"
    );
  });

  it("reports a claim table it could not reach", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));
    expect(await tryClaimSlackAlert("cron_stalled:x", "day", "2026-09-25")).toBe(false);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("only warns when Supabase is not configured at all, as in local development", async () => {
    delete process.env.SUPABASE_URL;
    expect(await tryClaimSlackAlert("cron_stalled:x", "day", "2026-09-25")).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
