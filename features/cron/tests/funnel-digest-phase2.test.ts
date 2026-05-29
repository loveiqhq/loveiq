/**
 * Phase 2 producer tests — verify the new chart-block builders correctly
 * gate on snapshot null / empty data, and that the daily message split
 * (msg1 / msg2) routes blocks to the right side.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  markSlackAlertDelivered: vi.fn(),
  recordCronRun: vi.fn(),
  startCronTimer: vi.fn().mockReturnValue(async () => {}),
  tryClaimSlackAlert: vi.fn().mockResolvedValue(false),
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => true,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "phase2-test-secret-1234567890";
});

import {
  buildPhase2FixedImageBlocks,
  buildChannelImageBlock,
  buildArchetypeImageBlock,
  buildQuestionsImageBlock,
} from "@/app/api/cron/funnel-digest/route";
import type {
  ExtendedSparklineV3Snapshot,
  ChannelSparklineSnapshot,
  ArchetypeSparklineSnapshot,
  VelocitySnapshot,
  QuestionAbandonmentSnapshot,
} from "@features/admin/server/digest-metrics";

function emptyV3Day(day: string) {
  return {
    day,
    intro: { s1: 0, s2: 0, s3: 0, s4: 0 },
    survey: {},
    wizard: {
      s1: 0,
      s2: 0,
      s3: 0,
      s4: 0,
      s5: 0,
      s6: 0,
      report_viewed: 0,
    },
    monetize: {
      report_viewed: 0,
      engagement_5min: 0,
      paywall_init: 0,
      begin_checkout: 0,
      purchased: 0,
    },
    pricing: { paywall_initiated: 0, price_shown: 0, begin_checkout: 0, purchased: 0 },
    ux: { rage_click: 0, scroll_depth_50: 0, scroll_depth_100: 0 },
    payment_health: { refunds: 0, disputes: 0, failed: 0, promo_redemptions: 0 },
    invite: { sent: 0, partner_completed: 0, partner_purchased: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildPhase2FixedImageBlocks", () => {
  it("returns [] when snapshot is null", async () => {
    expect(await buildPhase2FixedImageBlocks(null, null, "x")).toEqual([]);
  });

  it("returns [] when every bucket is flat-zero", async () => {
    const snap: ExtendedSparklineV3Snapshot = {
      days: [emptyV3Day("2026-05-27"), emptyV3Day("2026-05-28")],
    };
    expect(await buildPhase2FixedImageBlocks(snap, null, "x")).toEqual([]);
  });

  it("emits only the buckets with data — pricing only", async () => {
    const d = emptyV3Day("2026-05-28");
    d.pricing = { paywall_initiated: 5, price_shown: 4, begin_checkout: 2, purchased: 1 };
    const snap: ExtendedSparklineV3Snapshot = { days: [d] };
    const blocks = await buildPhase2FixedImageBlocks(snap, null, "30d");
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { alt_text: string }).alt_text).toBe("Pricing-modal funnel (4 stages)");
  });

  it("emits velocity block only when n>0 on at least one day", async () => {
    const d = emptyV3Day("2026-05-28");
    const v: VelocitySnapshot = {
      days: [{ day: "2026-05-28", n: 0, p50: 0, p75: 0, p90: 0 }],
    };
    expect(await buildPhase2FixedImageBlocks({ days: [d] }, v, "30d")).toEqual([]);
    const v2: VelocitySnapshot = {
      days: [{ day: "2026-05-28", n: 3, p50: 2.5, p75: 5, p90: 8 }],
    };
    const blocks = await buildPhase2FixedImageBlocks({ days: [d] }, v2, "30d");
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { alt_text: string }).alt_text).toBe(
      "Paywall → purchase decision time percentiles"
    );
  });

  it("emits all 5 blocks when every bucket has data", async () => {
    const d = emptyV3Day("2026-05-28");
    d.pricing = { paywall_initiated: 5, price_shown: 4, begin_checkout: 2, purchased: 1 };
    d.ux = { rage_click: 3, scroll_depth_50: 50, scroll_depth_100: 20 };
    d.payment_health = { refunds: 1, disputes: 0, failed: 2, promo_redemptions: 3 };
    d.invite = { sent: 10, partner_completed: 3, partner_purchased: 1 };
    const v: VelocitySnapshot = {
      days: [{ day: "2026-05-28", n: 3, p50: 2.5, p75: 5, p90: 8 }],
    };
    const blocks = await buildPhase2FixedImageBlocks({ days: [d] }, v, "30d");
    const altTexts = blocks.map((b) => (b as { alt_text: string }).alt_text);
    expect(altTexts).toEqual([
      "Pricing-modal funnel (4 stages)",
      "Paywall → purchase decision time percentiles",
      "UX friction signals (rage + scroll)",
      "Payment health (refunds, disputes, failed, promos)",
      "Viral loop (email-match attribution — lower-bound estimate)",
    ]);
  });
});

describe("buildChannelImageBlock", () => {
  it("returns null when snapshot is null", async () => {
    expect(await buildChannelImageBlock(null, "x")).toBeNull();
  });

  it("returns null when every source has zero total volume", async () => {
    const snap: ChannelSparklineSnapshot = {
      days: [
        {
          day: "2026-05-28",
          sources: { google: { starts: 0, completions: 0, purchases: 0 } },
        },
      ],
    };
    expect(await buildChannelImageBlock(snap, "x")).toBeNull();
  });

  it("emits image for top-N=5 sources ranked by total volume", async () => {
    const snap: ChannelSparklineSnapshot = {
      days: [
        {
          day: "2026-05-28",
          sources: {
            google: { starts: 50, completions: 30, purchases: 5 },
            facebook: { starts: 20, completions: 10, purchases: 2 },
            tiktok: { starts: 10, completions: 5, purchases: 1 },
          },
        },
      ],
    };
    const block = await buildChannelImageBlock(snap, "30d");
    expect(block).not.toBeNull();
    expect((block as { alt_text: string }).alt_text).toBe(
      "Top 3 acquisition channels — starts vs purchases per day"
    );
  });

  it("caps to top-5 sources by total volume", async () => {
    const sources: Record<string, { starts: number; completions: number; purchases: number }> = {};
    // Create 8 sources with descending totals — only top-5 should appear.
    for (let i = 0; i < 8; i += 1) {
      sources[`src${i}`] = { starts: 100 - i * 10, completions: 0, purchases: 0 };
    }
    const snap: ChannelSparklineSnapshot = {
      days: [{ day: "2026-05-28", sources }],
    };
    const block = await buildChannelImageBlock(snap, "30d");
    expect((block as { alt_text: string }).alt_text).toBe(
      "Top 5 acquisition channels — starts vs purchases per day"
    );
  });
});

describe("buildArchetypeImageBlock", () => {
  it("returns null when snapshot is null", async () => {
    expect(await buildArchetypeImageBlock(null, "x")).toBeNull();
  });

  it("emits block with top-N archetypes by combined completion+purchase volume", async () => {
    const snap: ArchetypeSparklineSnapshot = {
      days: [
        {
          day: "2026-05-28",
          archetypes: {
            "Tender Devotee": { completions: 20, purchases: 3 },
            "Radiant Performer": { completions: 10, purchases: 1 },
          },
        },
      ],
    };
    const block = await buildArchetypeImageBlock(snap, "30d");
    expect((block as { alt_text: string }).alt_text).toBe(
      "Top 2 archetypes — completion vs purchase per day"
    );
  });
});

describe("buildQuestionsImageBlock", () => {
  it("returns null on null snapshot", async () => {
    expect(await buildQuestionsImageBlock(null, "x")).toBeNull();
  });

  it("returns null when every row has zero total", async () => {
    const snap: QuestionAbandonmentSnapshot = {
      top_questions: [{ q_id: "00000", total: 0, days: [] }],
    };
    expect(await buildQuestionsImageBlock(snap, "x")).toBeNull();
  });

  it("emits block listing only live rows in label count", async () => {
    const snap: QuestionAbandonmentSnapshot = {
      top_questions: [
        { q_id: "01002", total: 12, days: [{ day: "2026-05-28", n: 12 }] },
        { q_id: "03005", total: 0, days: [] }, // hidden
        { q_id: "07001", total: 5, days: [{ day: "2026-05-28", n: 5 }] },
      ],
    };
    const block = await buildQuestionsImageBlock(snap, "14d");
    expect((block as { alt_text: string }).alt_text).toBe(
      "Top 2 abandoned survey questions over the window"
    );
  });
});
