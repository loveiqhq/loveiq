import { describe, expect, it } from "vitest";
import {
  fitsSlackImageUrl,
  signImagePayload,
  SLACK_IMAGE_URL_MAX,
} from "@shared/url/signed-image-url";

/**
 * Over Slack's image_url cap the block is rejected server-side and the WHOLE
 * post fails — there is no graceful degradation. Nothing checked the length
 * until 2026-09-15, and the drop-off chart runs at roughly 80% of the cap.
 */
describe("Slack image_url cap", () => {
  const url = (d: string, s: string) =>
    `https://www.loveiq.org/api/admin/digest-image/dropout-funnel?d=${d}&s=${s}`;

  it("passes a real 59-question drop-off payload", async () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "x".repeat(32);
    const bars = Array.from({ length: 59 }, (_, i) => ({
      label: `Q${i + 1}`,
      dropPct: (i * 7) % 40,
    }));
    const { d, s } = await signImagePayload({
      kind: "dropout-funnel",
      v: "abc1234",
      windowLabel: "30-day window",
      bars,
    });
    const built = url(d, s);
    expect(fitsSlackImageUrl(built)).toBe(true);
    // Headroom, not just a pass: this is the number that tells us how much
    // room a longer label or a longer survey actually has.
    expect(SLACK_IMAGE_URL_MAX - built.length).toBeGreaterThan(200);
  });

  it("rejects a payload that would take the whole post down", async () => {
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "x".repeat(32);
    // A survey twice as long, with the descriptive labels someone will
    // eventually want instead of "Qn".
    const bars = Array.from({ length: 120 }, (_, i) => ({
      label: `Question ${i + 1} — background and lifestyle`,
      dropPct: i % 40,
    }));
    const { d, s } = await signImagePayload({
      kind: "dropout-funnel",
      v: "abc1234",
      windowLabel: "30-day window",
      bars,
    });
    expect(fitsSlackImageUrl(url(d, s))).toBe(false);
  });

  it("is a boundary check, not an approximation", () => {
    expect(fitsSlackImageUrl("x".repeat(SLACK_IMAGE_URL_MAX))).toBe(true);
    expect(fitsSlackImageUrl("x".repeat(SLACK_IMAGE_URL_MAX + 1))).toBe(false);
  });
});
