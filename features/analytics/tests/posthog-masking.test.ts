// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ init: vi.fn(), register: vi.fn(), unregister: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

beforeEach(() => {
  vi.resetModules();
  ph.init.mockClear();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what PostHog's autocapture may send", () => {
  it("keeps every tap but none of the tapped element's text or attributes", async () => {
    // On /survey those were the answers: the option picked, and the scale's "6 of 7".
    await import("@/instrumentation-client");
    expect(ph.init).toHaveBeenCalledOnce();
    const options = ph.init.mock.calls[0]![1] as Record<string, unknown>;
    expect(options).toMatchObject({ mask_all_text: true, mask_all_element_attributes: true });
    expect(options.autocapture).not.toBe(false);
  });

  it("leaves session replays as decided (docs/compliance/DPIA.md §6)", async () => {
    await import("@/instrumentation-client");
    const options = ph.init.mock.calls[0]![1] as Record<string, unknown>;
    expect(options.session_recording).toBeUndefined();
  });
});
