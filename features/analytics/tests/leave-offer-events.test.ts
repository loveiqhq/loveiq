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
        }
    )
  );

describe("leave offer events", () => {
  it("records the offer being shown, with its trigger and the pay test's arm", async () => {
    client.trackLeaveOfferShown({
      variant: "founder_call",
      trigger: "paywall_reached",
      popup_arm: "no_popup",
      armed_ms: 31_234.6,
    });

    expect(sent("leave_offer_shown")).toEqual([
      expect.objectContaining({
        variant: "founder_call",
        trigger: "paywall_reached",
        popup_arm: "no_popup",
        armed_ms: 31_235,
      }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("leave_offer_shown");
    expect(row?.submission_id).toBe(42);
    expect(row?.metadata).toMatchObject({ variant: "founder_call", trigger: "paywall_reached" });
  });

  it("leaves the pay test's arm out for a reader who is in neither", () => {
    client.trackLeaveOfferShown({
      variant: "founder_call",
      trigger: "paywall_reached",
      popup_arm: null,
      armed_ms: 5_000,
    });
    expect(sent("leave_offer_shown")[0]).not.toHaveProperty("popup_arm");
  });

  it("records the booking page being opened", async () => {
    client.trackLeaveOfferClicked({
      variant: "founder_call",
      trigger: "paywall_reached",
      view_duration_ms: 4_200.4,
    });
    expect(sent("leave_offer_clicked")).toEqual([
      expect.objectContaining({
        variant: "founder_call",
        trigger: "paywall_reached",
        view_duration_ms: 4_200,
      }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("leave_offer_clicked");
  });

  it("records how the offer was turned down", async () => {
    client.trackLeaveOfferDismissed({
      variant: "founder_call",
      trigger: "paywall_reached",
      source: "not_now",
      view_duration_ms: -5,
    });
    expect(sent("leave_offer_dismissed")).toEqual([
      expect.objectContaining({ source: "not_now", view_duration_ms: 0 }),
    ]);
    const [row] = await stored();
    expect(row?.event_type).toBe("leave_offer_dismissed");
  });
});
