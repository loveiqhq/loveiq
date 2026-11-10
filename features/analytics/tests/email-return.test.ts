// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A return through one of our emails' links, as the report page reports it: the
 * #incoming-surveys message reads the persisted row as "Came back by email".
 */
const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));

type Client = typeof import("@features/analytics/client");
let client: Client;
let beacon: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  document.cookie = "__csrf=tok123; path=/";
  beacon = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  client = await import("@features/analytics/client");
});

describe("emailReturnOf", () => {
  const of = (query: string) => client.emailReturnOf(new URLSearchParams(query));

  it("names the campaign of a tagged email link", () => {
    expect(of("from=email&utm_source=email&utm_medium=nurture&utm_campaign=initial_gift")).toEqual({
      campaign: "initial_gift",
    });
    expect(of("utm_source=email&utm_campaign=72h_no_unlock")).toEqual({
      campaign: "72h_no_unlock",
    });
  });

  it("takes an untagged email link as a return with no campaign", () => {
    expect(of("from=email")).toEqual({ campaign: null });
    expect(of("invite=1&from=email&utm_campaign=")).toEqual({ campaign: null });
  });

  it("still counts a return whose campaign the route would refuse, as an untagged one", () => {
    expect(of("from=email&utm_campaign=%3Cb%3Espring%3C%2Fb%3E")).toEqual({ campaign: null });
    expect(of(`from=email&utm_campaign=${"x".repeat(65)}`)).toEqual({ campaign: null });
  });

  it("is no return without an email link", () => {
    expect(of("")).toBeNull();
    expect(of("utm_source=google&utm_campaign=spring")).toBeNull();
    expect(of("anchor=chapter-3")).toBeNull();
  });
});

describe("trackEmailReturn", () => {
  it("writes the return to our own table, against the report's survey", () => {
    (window as unknown as Record<string, unknown>).__loveiqReportSubmissionId = 2698;
    client.trackEmailReturn({ campaign: "initial_gift" });

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0]!;
    expect(url).toBe("/api/analytics-event");
    expect(JSON.parse(body as string)).toMatchObject({
      event_type: "email_return",
      submission_id: 2698,
      metadata: { campaign: "initial_gift" },
    });
  });
});
