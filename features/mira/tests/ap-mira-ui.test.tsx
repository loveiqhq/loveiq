// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  type MiraData,
  type MiraEventRow,
  type MiraPayload,
} from "@features/admin/server/ap/mira";
import miraConfig from "@features/mira/content/mira-config.json";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApMira from "@features/admin/ui/ap/ApMira";

afterEach(cleanup);

const TODAY = "2026-11-20";

const ev = (
  name: string,
  who: { anon?: string; user?: string },
  at: string,
  detail: string | null = null
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail,
});
const u1 = { user: "u1" };
const visitor = { anon: "visitor-1" };

/**
 * u1 last wrote on 1 Nov; the agreement nudge of 10 Nov is opened and clicked, and u1 writes
 * three messages, opening the chat with the first starter chip. Of the four nudges sent in the
 * range, three are delivered. A visitor opens Mira, gives the consent and meets the sign-up card
 * twice. Four NPS answers, one of them "Not now".
 */
const DATA: MiraData = {
  users: [
    {
      id: "u1",
      email: "a@example.com",
      created_at: "2026-11-02T09:00:00Z",
      style: {},
      use_assessment: true,
    },
  ],
  events: [
    ev("message_sent", u1, "2026-11-01T10:00:00Z"),
    ev("chat_started", u1, "2026-11-10T10:00:00Z", "0"),
    ev("message_sent", u1, "2026-11-10T10:00:00Z"),
    ev("message_sent", u1, "2026-11-10T10:02:00Z"),
    ev("message_sent", u1, "2026-11-10T10:04:00Z"),
    ev("chat_opened", visitor, "2026-11-10T11:00:00Z"),
    ev("consent_given", visitor, "2026-11-10T11:01:00Z"),
    ev("gate_shown", visitor, "2026-11-10T11:02:00Z"),
    ev("gate_shown", visitor, "2026-11-10T11:03:00Z"),
    ev("nps", u1, "2026-11-10T10:05:00Z", "9"),
    ev("nps", { anon: "a2" }, "2026-11-11T10:05:00Z", "10"),
    ev("nps", { anon: "a3" }, "2026-11-12T10:05:00Z", "2"),
    ev("nps", { anon: "a4" }, "2026-11-12T10:05:00Z", null),
  ],
  nudges: [
    {
      user_id: "u1",
      type: "agreement",
      sent_at: "2026-11-10T07:00:00Z",
      clicked_at: "2026-11-10T09:30:00Z",
      delivered_at: "2026-11-10T07:00:05Z",
      opened_at: "2026-11-10T08:00:00Z",
    },
    ...["share", "progress"].map((type, i) => ({
      user_id: "u1",
      type,
      sent_at: `2026-11-1${i + 1}T07:00:00Z`,
      clicked_at: null,
      delivered_at: `2026-11-1${i + 1}T07:00:05Z`,
      opened_at: null,
    })),
    {
      user_id: "u1",
      type: "celebrate",
      sent_at: "2026-11-13T07:00:00Z",
      clicked_at: null,
      delivered_at: null,
      opened_at: null,
    },
  ],
  withResult: new Set(),
};

function show(): MiraPayload {
  const payload = buildMiraPage({
    data: DATA,
    filters: parseFilters({ period: "custom", from: "2026-11-09", to: "2026-11-15" }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });
  view.payload = payload;
  render(<ApMira />);
  return payload;
}

describe("the Mira staff page", () => {
  it("shows reactivation as the design defines it, and the nudges' opens, messages and unsubscribes", () => {
    const payload = show();
    expect(payload.tiles.nudgeOpen!.value).toBeCloseTo(1 / 3);

    const box = screen.getByText("Reactivated by nudges").closest("div")!;
    expect(within(box).queryByText(/Not measured yet/)).toBeNull();
    expect(within(box).getByText("1 of 1 away 7+ days wrote within 48 h")).toBeTruthy();

    const nudges = screen.getByRole("region", { name: "Daily nudge emails" });
    expect(within(nudges).queryByText(/aren.t tracked/)).toBeNull();
    expect(within(nudges).queryByText(/Not measured yet/)).toBeNull();
    expect(within(nudges).getByText(/Apple Mail opens every email it receives/)).toBeTruthy();
    const table = within(nudges).getByRole("table", { name: "Performance by nudge type" });
    expect(within(table).getByRole("columnheader", { name: "Open rate" })).toBeTruthy();
    const agreement = within(table).getByRole("rowheader", {
      name: "Follow up on the agreement",
    }).parentElement!;
    // Opened, clicked, a conversation of 3 messages, no unsubscribe.
    expect(
      within(agreement)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["1", "100.0%", "100.0%", "100.0%", "3.0", "0.0%"]);
  });

  it("names the 30-minute rule, and measures the chips, NPS, time spent and the consent step", () => {
    show();
    expect(screen.getAllByText(/more than 30 minutes/).length).toBeGreaterThan(0);

    const chips = screen.getByRole("region", { name: "Most used starter chips" });
    expect(within(chips).queryByText(/Not measured yet/)).toBeNull();
    const first = within(chips).getByRole("rowheader", {
      name: miraConfig.starterChips[0],
    }).parentElement!;
    expect(
      within(first)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["1", "100.0%", "100.0%"]);

    const satisfaction = screen.getByRole("region", { name: "Satisfaction" });
    expect(within(satisfaction).queryByText(/Not measured yet/)).toBeNull();
    // 9, 10 and 2: two promoters and one detractor of three scores.
    expect(within(satisfaction).getByText("NPS 33")).toBeTruthy();
    expect(within(satisfaction).getByText(/it was 25\.0% of the 4 replies/)).toBeTruthy();

    const funnel = screen.getByRole("region", { name: "From first message to subscriber" });
    expect(within(funnel).getByText("Gave consent")).toBeTruthy();
    const gate = within(funnel).getByText("Shown the sign-up card").closest("div")!;
    expect(within(gate).getByText("1")).toBeTruthy();

    const time = screen.getAllByText("Daily time spent")[0]!.closest("div")!;
    expect(within(time).queryByText(/Not measured yet/)).toBeNull();
  });

  it("leaves “Not measured yet” only where nothing records the figure, each with its reason", () => {
    show();
    const outcomes = screen.getByRole("region", { name: "Outcomes & satisfaction" });
    for (const name of ["Most common prompts", "Therapeutic success"]) {
      const card = within(outcomes).getByRole("region", { name });
      expect(within(card).getByText("Not measured yet")).toBeTruthy();
    }
    expect(within(outcomes).getByText(/Nothing groups first messages into topics/)).toBeTruthy();
    expect(within(outcomes).getByText(/no body-image scale is asked yet/)).toBeTruthy();
    expect(within(outcomes).getByText(/3 of its 5 areas aren.t asked yet/)).toBeTruthy();
    expect(within(outcomes).getByText(/don.t record a doctor or therapist/)).toBeTruthy();
  });
});
