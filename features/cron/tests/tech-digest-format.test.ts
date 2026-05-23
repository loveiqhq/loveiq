// Locks the Slack message format for /api/cron/tech-digest.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { TechMetrics } from "@features/admin/server/digest-tech";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  tryClaimSlackAlert: vi.fn().mockResolvedValue(false),
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));

import {
  formatTechDigest,
  formatHealth,
  formatStuck,
  formatWebhooks,
  formatCronHealth,
  formatSecurity,
} from "@/app/api/cron/tech-digest/route";

const emptyMetrics: TechMetrics = {
  health: null,
  stuck: null,
  webhooks: null,
  cronHealth: null,
  security: null,
};

function healthyMetrics(): TechMetrics {
  return {
    health: {
      overall: "healthy",
      lines: [
        { name: "Supabase", status: "healthy", latencyMs: 118, detail: "ok" },
        { name: "Resend", status: "healthy", latencyMs: null, detail: "configured" },
      ],
    },
    stuck: { count: 0, sampleIds: [] },
    webhooks: {
      stripeTotal: 47,
      stripeProcessed: 47,
      stripeErrors: 0,
      stripeTopEvents: [
        { eventType: "checkout.session.completed", count: 32 },
        { eventType: "charge.refunded", count: 2 },
      ],
      resendOpened: 142,
      resendClicked: 38,
    },
    cronHealth: { totalCrons: 0, totalRuns: 0, totalErrors: 0, p95Ms: 0, byCron: [] },
    security: {
      csrfStorms: 0,
      rateLimitStorms: 0,
      circuitOpens: 0,
      circuitRecovered: 0,
    },
  };
}

function alarmingMetrics(): TechMetrics {
  return {
    health: {
      overall: "degraded",
      lines: [
        { name: "Supabase", status: "degraded", latencyMs: 1800, detail: "slow" },
        { name: "Resend", status: "down", latencyMs: null, detail: "unreachable" },
      ],
    },
    stuck: { count: 5, sampleIds: [101, 102, 103] },
    webhooks: {
      stripeTotal: 20,
      stripeProcessed: 18,
      stripeErrors: 2,
      stripeTopEvents: [{ eventType: "charge.dispute.created", count: 1 }],
      resendOpened: 0,
      resendClicked: 0,
    },
    cronHealth: {
      totalCrons: 2,
      totalRuns: 12,
      totalErrors: 3,
      p95Ms: 4200,
      byCron: [
        { cronName: "nurture-sequence", runs: 6, errors: 2, avgMs: 1800, p95Ms: 8400 },
        { cronName: "funnel-digest", runs: 6, errors: 1, avgMs: 1200, p95Ms: 3500 },
      ],
    },
    security: {
      csrfStorms: 2,
      rateLimitStorms: 1,
      circuitOpens: 1,
      circuitRecovered: 1,
    },
  };
}

describe("formatTechDigest — empty state", () => {
  it("renders no-signals fallback when every section is null", () => {
    const msg = formatTechDigest("2026-05-22", emptyMetrics);
    expect(msg).toContain("Tech digest");
    expect(msg).toContain("_No tech signals today._");
  });
});

describe("formatTechDigest — happy path (healthy)", () => {
  it("shows all-clear lines when nothing is wrong", () => {
    const msg = formatTechDigest("2026-05-22", healthyMetrics());
    expect(msg).toContain("Service health");
    expect(msg).toContain("Stuck payments");
    expect(msg).toContain(":white_check_mark: 0 stuck");
    expect(msg).toContain("no cron runs recorded");
    expect(msg).toContain(":white_check_mark: 0 storms");
  });
});

describe("formatTechDigest — alarming path", () => {
  it("shows :rotating_light: + stuck IDs + cron breakdown", () => {
    const msg = formatTechDigest("2026-05-22", alarmingMetrics());
    expect(msg).toContain(":rotating_light: 5 stuck");
    expect(msg).toContain("101, 102, 103");
    expect(msg).toContain("2 crons | 12 runs");
    expect(msg).toContain("3 errors");
    expect(msg).toContain("nurture-sequence");
    expect(msg).toContain("CSRF storms: 2");
  });
});

describe("formatHealth", () => {
  it("returns [] when null", () => {
    expect(formatHealth(emptyMetrics)).toEqual([]);
  });

  it("renders one bullet per service with status emoji", () => {
    const lines = formatHealth(healthyMetrics());
    expect(lines[0]).toContain("overall");
    expect(lines.some((l) => l.includes("Supabase") && l.includes("118ms"))).toBe(true);
  });

  it("uses degraded vs down emojis when services unhealthy", () => {
    const lines = formatHealth(alarmingMetrics());
    expect(lines.some((l) => l.includes(":large_yellow_circle:") && l.includes("Supabase"))).toBe(
      true
    );
    expect(lines.some((l) => l.includes(":red_circle:") && l.includes("Resend"))).toBe(true);
  });
});

describe("formatStuck", () => {
  it("returns [] when null", () => {
    expect(formatStuck(emptyMetrics)).toEqual([]);
  });

  it("renders all-clear when count=0", () => {
    const lines = formatStuck(healthyMetrics());
    expect(lines[0]).toBe("*Stuck payments*");
    expect(lines[1]).toContain(":white_check_mark: 0 stuck");
  });

  it("renders alert + sample IDs when count > 0", () => {
    const lines = formatStuck(alarmingMetrics());
    expect(lines[0]).toBe("*Stuck payments*");
    expect(lines[1]).toContain(":rotating_light: 5 stuck");
    expect(lines[1]).toContain("101");
  });
});

describe("formatWebhooks", () => {
  it("returns [] when null", () => {
    expect(formatWebhooks(emptyMetrics)).toEqual([]);
  });

  it("returns [] when truly empty (no Stripe, no Resend)", () => {
    const m: TechMetrics = {
      ...emptyMetrics,
      webhooks: {
        stripeTotal: 0,
        stripeProcessed: 0,
        stripeErrors: 0,
        stripeTopEvents: [],
        resendOpened: 0,
        resendClicked: 0,
      },
    };
    expect(formatWebhooks(m)).toEqual([]);
  });

  it("renders Stripe + Resend lines when activity present", () => {
    const lines = formatWebhooks(healthyMetrics());
    expect(lines[0]).toBe("*Webhook intake*");
    expect(lines.some((l) => l.includes("Stripe") && l.includes("47"))).toBe(true);
    expect(lines.some((l) => l.includes("Resend") && l.includes("142"))).toBe(true);
  });
});

describe("formatCronHealth", () => {
  it("returns [] when null", () => {
    expect(formatCronHealth(emptyMetrics)).toEqual([]);
  });

  it("renders no-runs message when totalRuns=0", () => {
    const lines = formatCronHealth(healthyMetrics());
    expect(lines[0]).toBe("*Cron health (24h)*");
    expect(lines[1]).toContain("no cron runs recorded");
  });

  it("renders aggregate + worst-offender line when runs present", () => {
    const lines = formatCronHealth(alarmingMetrics());
    expect(lines[0]).toBe("*Cron health (24h)*");
    expect(lines[1]).toContain("2 crons");
    expect(lines[1]).toContain("12 runs");
    expect(lines[1]).toContain("3 errors");
    expect(lines[1]).toContain("p95 4.20s");
    expect(lines.some((l) => l.includes("Worst: nurture-sequence"))).toBe(true);
  });
});

describe("formatSecurity", () => {
  it("returns [] when null", () => {
    expect(formatSecurity(emptyMetrics)).toEqual([]);
  });

  it("renders all-clear when totals are zero", () => {
    const lines = formatSecurity(healthyMetrics());
    expect(lines[1]).toContain(":white_check_mark: 0 storms");
  });

  it("renders the breakdown when anything fires", () => {
    const lines = formatSecurity(alarmingMetrics());
    expect(lines[1]).toContain("CSRF storms: 2");
    expect(lines[1]).toContain("Rate-limit storms: 1");
    expect(lines[1]).toContain("Circuit opens: 1");
  });
});

// -----------------------------------------------------------------------------
// Round 4: Deploy marker
// -----------------------------------------------------------------------------

import { formatDeployMarker } from "@/app/api/cron/tech-digest/route";

describe("formatDeployMarker", () => {
  const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const originalDpl = process.env.VERCEL_DEPLOYMENT_ID;

  afterEach(() => {
    if (originalSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
    if (originalDpl === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = originalDpl;
  });

  it("returns null when neither env var is set", () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_DEPLOYMENT_ID;
    expect(formatDeployMarker()).toBeNull();
  });

  it("uses the 7-char short SHA + deployment id when both set", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "a1b2c3d4e5f6";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_abc123";
    const line = formatDeployMarker();
    expect(line).toContain("`a1b2c3d`");
    expect(line).toContain("dpl_abc123");
  });

  it("renders the SHA alone when deployment id is unset", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567";
    delete process.env.VERCEL_DEPLOYMENT_ID;
    const line = formatDeployMarker();
    expect(line).toContain("`abcdef1`");
    expect(line).not.toContain("(");
  });
});
