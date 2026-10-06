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
 * PostHog as the `landing_variant` super-property, registered by LandingPageTracker,
 * so every one of these is already split by arm without repeating it.
 */
describe("hero video events", () => {
  it("names a first watch and a replay apart", () => {
    client.trackHeroVideoPlay({ replay: false });
    client.trackHeroVideoPlay({ replay: true });
    expect(ph.capture).toHaveBeenNthCalledWith(1, "hero_video_play", { replay: false });
    expect(ph.capture).toHaveBeenNthCalledWith(2, "hero_video_play", { replay: true });
  });

  it("sends each progress milestone as its own percent", () => {
    for (const percent of [25, 50, 75] as const) client.trackHeroVideoProgress({ percent });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_progress", { percent: 25 }],
      ["hero_video_progress", { percent: 50 }],
      ["hero_video_progress", { percent: 75 }],
    ]);
  });

  it("sends completion with no params", () => {
    client.trackHeroVideoComplete();
    // track() hands PostHog the params as given, as it does for report_viewed.
    expect(ph.capture).toHaveBeenCalledWith("hero_video_complete", undefined);
  });

  it("names which video failed and why", () => {
    client.trackHeroVideoError({ video: "full", reason: "media-error-2" });
    client.trackHeroVideoError({ video: "preview", reason: "NotSupportedError" });
    expect(ph.capture.mock.calls).toEqual([
      ["hero_video_error", { video: "full", reason: "media-error-2" }],
      ["hero_video_error", { video: "preview", reason: "NotSupportedError" }],
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
