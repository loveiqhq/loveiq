// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the vi.mock factory below can close over the same spies.
const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

let client: typeof import("@features/analytics/client");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  client = await import("@features/analytics/client");
  window.gtag = vi.fn() as unknown as typeof window.gtag;
});

/**
 * The landing hero video's events. They carry no arm on purpose: the arm reaches
 * PostHog as the `landing_variant` super-property, registered from the arm cookie when
 * PostHog loads (instrumentation-client.ts) and again by LandingPageTracker, so every
 * one of these is already split by arm without repeating it.
 */
describe("hero video events", () => {
  it("counts a tap on play, a first watch's and a replay's apart", () => {
    client.trackHeroVideoTap({ replay: false });
    client.trackHeroVideoTap({ replay: true });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_tap", { replay: false }],
      ["hero_video_tap", { replay: true }],
    ]);
  });

  it("names a first watch and a replay apart", () => {
    client.trackHeroVideoPlay({ replay: false });
    client.trackHeroVideoPlay({ replay: true });
    expect(ph.capture).toHaveBeenNthCalledWith(1, "hero_video_play", { replay: false });
    expect(ph.capture).toHaveBeenNthCalledWith(2, "hero_video_play", { replay: true });
  });

  it("sends each progress milestone as its own percent, saying whether it is a replay's", () => {
    for (const percent of [25, 50, 75] as const) {
      client.trackHeroVideoProgress({ percent, replay: false });
    }
    client.trackHeroVideoProgress({ percent: 25, replay: true });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_progress", { percent: 25, replay: false }],
      ["hero_video_progress", { percent: 50, replay: false }],
      ["hero_video_progress", { percent: 75, replay: false }],
      ["hero_video_progress", { percent: 25, replay: true }],
    ]);
  });

  it("sends a finish saying whether it is a replay's", () => {
    client.trackHeroVideoComplete({ replay: false });
    client.trackHeroVideoComplete({ replay: true });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_complete", { replay: false }],
      ["hero_video_complete", { replay: true }],
    ]);
  });

  it("names the failed start's reason", () => {
    client.trackHeroVideoError({ video: "full", reason: "media-error-2" });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_error", { video: "full", reason: "media-error-2" }],
    ]);
  });

  it("sends a start left behind as an error, by beacon, because the page is going", () => {
    client.trackHeroVideoAbandoned();
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_error", { video: "full", reason: "abandoned" }, { transport: "sendBeacon" }],
    ]);
  });

  it("keeps the pause and resume events where they were", () => {
    client.trackHeroVideoPaused({ current_time_sec: 12 });
    client.trackHeroVideoResumed({ current_time_sec: 12 });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_paused", { current_time_sec: 12 }],
      ["hero_video_resumed", { current_time_sec: 12 }],
    ]);
  });
});
