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
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
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

/** A free reader's five stops, as V4GuidedTour hands them over (fractional ms included). */
const FIVE = [
  { id: "chapter_menu", ms: 6_100.4, back: 0 },
  { id: "show_all", ms: 4_800.6, back: 1 },
  { id: "chapter_toggle", ms: 3_900, back: 0 },
  { id: "try_this", ms: 5_200, back: 0 },
  { id: "unlock", ms: -2, back: 0 },
] as const;
const FIVE_SENT = [
  { id: "chapter_menu", ms: 6_100, back: 0 },
  { id: "show_all", ms: 4_801, back: 1 },
  { id: "chapter_toggle", ms: 3_900, back: 0 },
  { id: "try_this", ms: 5_200, back: 0 },
  { id: "unlock", ms: 0, back: 0 },
];

/**
 * The guided tour's events (Figma spec card 1755:1276). PostHog hears every one; the
 * submission's own record keeps only a first run's start and end, and each replay, so a
 * click-through cannot eat the route's 20 stored events a minute. The stored end carries the
 * run itself (whose tour, and each stop's time and Back presses), which the AP counts from.
 */
describe("guided tour events", () => {
  it("stores a first run's start, with whose tour it is and how many stops it has", async () => {
    client.trackTourStarted({ trigger: "auto", audience: "free", steps: 5 });
    expect(sent("tour_started")).toEqual([
      expect.objectContaining({ trigger: "auto", audience: "free", steps: 5 }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_started");
    expect(row?.submission_id).toBe(42);
    expect(row?.metadata).toMatchObject({ trigger: "auto", audience: "free", steps: 5 });
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

  it("stores where a first run was skipped, how, after how long, and every stop it reached", async () => {
    client.trackTourSkipped({
      trigger: "auto",
      audience: "free",
      at: 3,
      id: "chapter_toggle",
      steps: 5,
      source: "escape",
      duration_ms: 6_400.6,
      stops: FIVE.slice(0, 3),
    });
    expect(sent("tour_skipped")).toEqual([
      expect.objectContaining({
        audience: "free",
        at: 3,
        id: "chapter_toggle",
        source: "escape",
        duration_ms: 6_401,
        stops: FIVE_SENT.slice(0, 3),
      }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_skipped");
    expect(row?.metadata).toMatchObject({
      audience: "free",
      at: 3,
      id: "chapter_toggle",
      steps: 5,
      source: "escape",
      stops: FIVE_SENT.slice(0, 3),
    });
    expect(row?.duration_ms).toBe(6_401);
  });

  it("stores a first run seen through, with whose tour it was and its stops", async () => {
    client.trackTourCompleted({
      trigger: "auto",
      audience: "paid",
      steps: 4,
      duration_ms: -3,
      stops: FIVE.slice(0, 4),
    });
    expect(sent("tour_completed")).toEqual([
      expect.objectContaining({ audience: "paid", steps: 4, duration_ms: 0 }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("tour_completed");
    expect(row?.metadata).toMatchObject({
      trigger: "auto",
      audience: "paid",
      steps: 4,
      stops: FIVE_SENT.slice(0, 4),
    });
  });

  it("stores a first run left with the page, by beacon to PostHog and to our table", async () => {
    client.trackTourLeft({
      trigger: "auto",
      audience: "free",
      at: 2,
      id: "show_all",
      steps: 5,
      duration_ms: 9_000.2,
      stops: FIVE.slice(0, 2),
    });
    // PostHog's own queue may not outlive the page: its beacon.
    expect(ph.capture).toHaveBeenCalledWith(
      "tour_left",
      expect.objectContaining({ at: 2, id: "show_all", stops: FIVE_SENT.slice(0, 2) }),
      { transport: "sendBeacon" }
    );
    const [row] = await stored();
    expect(row).toMatchObject({
      event_type: "tour_left",
      submission_id: 42,
      duration_ms: 9_000,
      metadata: {
        trigger: "auto",
        audience: "free",
        at: 2,
        id: "show_all",
        steps: 5,
        duration_ms: 9_000,
        stops: FIVE_SENT.slice(0, 2),
      },
    });
  });

  it("keeps a run's stops out of Google's dataLayer, which takes flat parameters", () => {
    document.cookie = "cookieyes-consent=analytics:yes; path=/";
    window.dataLayer = [];
    client.trackTourCompleted({
      trigger: "auto",
      audience: "free",
      steps: 5,
      duration_ms: 20_000,
      stops: [...FIVE],
    });
    const pushed = (window.dataLayer as Record<string, unknown>[]).filter(
      (e) => e.event === "tour_completed"
    );
    expect(pushed).toEqual([
      { event: "tour_completed", trigger: "auto", audience: "free", steps: 5, duration_ms: 20_000 },
    ]);
  });

  it("keeps the longest stored end within the route's metadata limits", async () => {
    client.trackTourSkipped({
      trigger: "auto",
      audience: "free",
      at: 5,
      id: "unlock",
      steps: 5,
      source: "browser_back",
      duration_ms: 86_000_000,
      stops: FIVE.map((s) => ({ ...s, ms: 1_799_999_999, back: 999 })),
    });
    const [row] = await stored();
    expect(Object.keys(row!.metadata).length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(row!.metadata).length).toBeLessThanOrEqual(8_192);
  });

  it("stores the replay tap but not the replayed run's own start and end", async () => {
    client.trackTourReplayed({ source: "drawer" });
    client.trackTourStarted({ trigger: "replay", audience: "free", steps: 5 });
    client.trackTourSkipped({
      trigger: "replay",
      audience: "free",
      at: 1,
      id: "chapter_menu",
      steps: 5,
      source: "skip_button",
      duration_ms: 900,
      stops: FIVE.slice(0, 1),
    });
    client.trackTourCompleted({
      trigger: "replay",
      audience: "free",
      steps: 5,
      duration_ms: 9_000,
      stops: [...FIVE],
    });
    client.trackTourLeft({
      trigger: "replay",
      audience: "free",
      at: 2,
      id: "show_all",
      steps: 5,
      duration_ms: 1_000,
      stops: FIVE.slice(0, 2),
    });
    expect(sent("tour_replayed")).toEqual([expect.objectContaining({ source: "drawer" })]);
    expect(sent("tour_started")).toHaveLength(1);
    expect(sent("tour_left")).toHaveLength(1);
    expect((await stored()).map((row) => row.event_type)).toEqual(["tour_replayed"]);
  });
});
