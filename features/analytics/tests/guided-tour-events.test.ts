// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({
  capture: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: ph }));

type Client = typeof import("@features/analytics/client");
let client: Client;
let beacon: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
  vi.resetModules();
  // jsdom on an http origin refuses a __Host- prefixed cookie; the client also
  // accepts the __csrf fallback.
  document.cookie = "__csrf=tok123; path=/";
  beacon = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  client = await import("@features/analytics/client");
  client.setReportSubmissionContext(42);
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId;
});

const sent = (name: string) =>
  ph.capture.mock.calls.filter(([n]) => n === name).map(([, params]) => params) as Array<
    Record<string, unknown>
  >;

const stored = async () =>
  Promise.all(
    beacon.mock.calls.map(
      async ([, blob]) =>
        JSON.parse(await (blob as Blob).text()) as {
          event_type: string;
          submission_id: number;
          metadata: Record<string, unknown>;
          duration_ms?: number;
        }
    )
  );

/**
 * The guided tour's events (Figma spec card 1755:1276). PostHog hears every one; the
 * submission's own record keeps only a first run's start and outcome, and each replay,
 * so a click-through cannot eat the route's 20 stored events a minute.
 */
describe("guided tour events", () => {
  it("stores a first run's start, with how many stops it has", async () => {
    client.trackTourStarted({ trigger: "auto", steps: 5 });
    expect(sent("tour_started")).toEqual([expect.objectContaining({ trigger: "auto", steps: 5 })]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_started");
    expect(row?.submission_id).toBe(42);
    expect(row?.metadata).toMatchObject({ trigger: "auto", steps: 5 });
  });

  it("sends each stop and each step back to PostHog only", async () => {
    client.trackTourStepViewed({ trigger: "auto", n: 2, id: "show_all", steps: 5 });
    client.trackTourBack({ trigger: "auto", to: 1, steps: 5 });
    expect(sent("tour_step_viewed")).toEqual([
      expect.objectContaining({ n: 2, id: "show_all", steps: 5, trigger: "auto" }),
    ]);
    expect(sent("tour_back")).toEqual([expect.objectContaining({ to: 1, steps: 5 })]);
    expect(await stored()).toEqual([]);
  });

  it("stores where a first run was left, how, and after how long", async () => {
    client.trackTourSkipped({
      trigger: "auto",
      at: 3,
      id: "chapter_toggle",
      steps: 5,
      source: "escape",
      duration_ms: 6_400.6,
    });
    expect(sent("tour_skipped")).toEqual([
      expect.objectContaining({
        at: 3,
        id: "chapter_toggle",
        source: "escape",
        duration_ms: 6_401,
      }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_skipped");
    expect(row?.metadata).toMatchObject({ at: 3, steps: 5, source: "escape" });
    expect(row?.duration_ms).toBe(6_401);
  });

  it("stores a first run seen through", async () => {
    client.trackTourCompleted({ trigger: "auto", steps: 4, duration_ms: -3 });
    expect(sent("tour_completed")).toEqual([expect.objectContaining({ steps: 4, duration_ms: 0 })]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_completed");
  });

  it("stores the replay tap but not the replayed run's own start and end", async () => {
    client.trackTourReplayed({ source: "drawer" });
    client.trackTourStarted({ trigger: "replay", steps: 5 });
    client.trackTourSkipped({
      trigger: "replay",
      at: 1,
      id: "chapter_menu",
      steps: 5,
      source: "skip_button",
      duration_ms: 900,
    });
    client.trackTourCompleted({ trigger: "replay", steps: 5, duration_ms: 9_000 });
    expect(sent("tour_replayed")).toEqual([expect.objectContaining({ source: "drawer" })]);
    expect(sent("tour_started")).toHaveLength(1);
    expect((await stored()).map((row) => row.event_type)).toEqual(["tour_replayed"]);
  });
});
