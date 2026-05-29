/**
 * Unit tests for `buildLongitudinalImageBlocks` — produces the four phase-
 * bucketed Slack image blocks (intro / survey / wizard / monetize) from an
 * ExtendedSparklineSnapshot.
 *
 * Behaviour we verify:
 *   - Returns [] when snapshot is null OR has zero days
 *   - Returns [] when every phase bucket is flat-zero (no story to tell)
 *   - Omits individual phases that have no data, keeps the ones that do
 *   - Discovers survey chapters dynamically (only includes chapters with traffic)
 *   - Survey block windows down to last 14 days (URL-cap safety)
 *
 * NEXT_PUBLIC_SITE_URL + STRATEGY_DIGEST_SIGNING_SECRET are stubbed via env so
 * buildSignedImageUrl produces real URLs (Web Crypto path is exercised).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

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
  // 16+ chars satisfies the secret-length guard in shared/url/signed-image-url.ts
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-secret-1234567890";
});

import { buildLongitudinalImageBlocks } from "@/app/api/cron/funnel-digest/route";
import type { ExtendedSparklineSnapshot } from "@features/admin/server/digest-metrics";

function emptyDay(day: string) {
  return {
    day,
    intro: { s1: 0, s2: 0, s3: 0, s4: 0 },
    survey: {},
    wizard: { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, report_viewed: 0 },
    monetize: {
      report_viewed: 0,
      engagement_5min: 0,
      paywall_init: 0,
      begin_checkout: 0,
      purchased: 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildLongitudinalImageBlocks", () => {
  it("returns [] when snapshot is null", async () => {
    const blocks = await buildLongitudinalImageBlocks(null, "30 days ending 2026-05-28 UTC");
    expect(blocks).toEqual([]);
  });

  it("returns [] when snapshot has zero days", async () => {
    const snap: ExtendedSparklineSnapshot = { days: [] };
    const blocks = await buildLongitudinalImageBlocks(snap, "30 days ending 2026-05-28 UTC");
    expect(blocks).toEqual([]);
  });

  it("returns [] when every phase bucket is flat-zero", async () => {
    const snap: ExtendedSparklineSnapshot = {
      days: [emptyDay("2026-05-27"), emptyDay("2026-05-28")],
    };
    const blocks = await buildLongitudinalImageBlocks(snap, "x");
    expect(blocks).toEqual([]);
  });

  it("emits intro block when only intro data is non-zero", async () => {
    const day = emptyDay("2026-05-28");
    day.intro = { s1: 10, s2: 8, s3: 6, s4: 4 };
    const snap: ExtendedSparklineSnapshot = { days: [day] };
    const blocks = await buildLongitudinalImageBlocks(snap, "30 days");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "image",
      alt_text: "Pre-survey intro retention (4 slides)",
    });
    expect((blocks[0] as { image_url: string }).image_url).toContain(
      "/api/admin/digest-image/sparklines-intro"
    );
  });

  it("emits ALL four blocks when every phase has data", async () => {
    const day = emptyDay("2026-05-28");
    day.intro = { s1: 50, s2: 40, s3: 35, s4: 30 };
    day.survey = { "00": 30, "01": 25, "15": 5 };
    day.wizard = { s1: 20, s2: 18, s3: 15, s4: 12, s5: 10, s6: 8, report_viewed: 8 };
    day.monetize = {
      report_viewed: 8,
      engagement_5min: 5,
      paywall_init: 3,
      begin_checkout: 2,
      purchased: 1,
    };
    const snap: ExtendedSparklineSnapshot = { days: [day] };
    const blocks = await buildLongitudinalImageBlocks(snap, "30 days");
    const altTexts = blocks.map((b) => (b as { alt_text: string }).alt_text);
    expect(altTexts).toEqual([
      "Pre-survey intro retention (4 slides)",
      "Survey chapter completion (3 chapters)",
      "Pre-report wizard retention (6 slides + report view)",
      "Monetization ladder (5 stages)",
    ]);
  });

  it("only includes chapters with non-zero traffic in the survey image", async () => {
    // 15 days of data — survey image uses last 14 (one trimmed). Chapter "07"
    // only appears in the FIRST day → gets trimmed → not in the alt-text count.
    const days = [];
    for (let i = 0; i < 15; i += 1) {
      const d = emptyDay(`2026-05-${String(14 + i).padStart(2, "0")}`);
      if (i === 0) d.survey = { "00": 2, "07": 99 };
      else d.survey = { "00": 2 };
      days.push(d);
    }
    const snap: ExtendedSparklineSnapshot = { days };
    const blocks = await buildLongitudinalImageBlocks(snap, "30 days");
    const surveyBlock = blocks.find((b) =>
      ((b as { alt_text?: string }).alt_text ?? "").startsWith("Survey chapter completion")
    );
    expect(surveyBlock).toBeDefined();
    expect((surveyBlock as { alt_text: string }).alt_text).toBe(
      "Survey chapter completion (1 chapters)"
    );
  });
});
