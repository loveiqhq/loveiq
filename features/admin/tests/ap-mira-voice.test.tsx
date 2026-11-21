// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** AP › Mira › Voice: talking to Mira by voice (features/mira/server/voice.ts), ids and numbers. */

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const db = vi.hoisted(() => ({ fetch: vi.fn(), all: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: db.fetch,
  fetchAllRows: db.all,
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  fetchMira,
  type MiraData,
  type MiraEventRow,
  type MiraVoiceRow,
} from "@features/admin/server/ap/mira";
import ApMira from "@features/admin/ui/ap/ApMira";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

const TODAY = "2026-11-30";
const S1 = "1c2d3e4f-3333-4444-8555-a66677778888";
const S2 = "2d3e4f50-4444-4555-8666-b77788889999";
const S3 = "3e4f5061-5555-4666-8777-c88899990000";

const ended = (
  who: { anon?: string; user?: string },
  at: string,
  props: { seconds: number; mode: string; session?: string; points?: number; team?: true }
): MiraVoiceRow => ({
  name: "voice_session_ended",
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  seconds: props.seconds,
  mode: props.mode,
  session: props.session ?? null,
  points: props.points ?? 0,
  ...(props.team ? { team: true as const } : {}),
});
const opened = (user: string, at: string, session: string): MiraVoiceRow => ({
  name: "voice_points_opened",
  anon_id: null,
  user_id: user,
  at: Date.parse(at),
  seconds: null,
  mode: null,
  session,
  points: 0,
});
const signup = (anon: string, user: string, at: string): MiraEventRow => ({
  name: "signup_completed",
  anon_id: anon,
  user_id: user,
  at: Date.parse(at),
  detail: "email",
});
const account = (id: string, email: string, over = {}) => ({
  id,
  email,
  created_at: "2026-11-20T10:00:00Z",
  style: {},
  use_assessment: false,
  ...over,
});

/**
 * Lea talks twice signed out, signs up from that browser, then twice signed in (both kept with
 * key points; she opens one of them later). A visitor talks once. The team talks from its own
 * account, from a team browser, and from a browser it later marked.
 */
const DATA: MiraData = {
  users: [
    account("lea", "lea@example.com"),
    account("staff", "eman@loveiq.org"),
    account("marked", "m@example.com", { is_team: true }),
  ],
  events: [
    signup("lea-browser", "lea", "2026-11-22T09:00:00Z"),
    {
      name: "chat_opened",
      anon_id: "team-browser",
      user_id: null,
      at: Date.parse("2026-11-23T09:00:00Z"),
      detail: null,
      team: true,
    },
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
  voice: [
    ended({ anon: "lea-browser" }, "2026-11-21T20:00:00Z", { seconds: 120, mode: "service" }),
    ended({ anon: "lea-browser" }, "2026-11-21T21:00:00Z", { seconds: 300, mode: "service" }),
    ended({ user: "lea" }, "2026-11-23T20:00:00Z", {
      seconds: 600,
      mode: "device",
      session: S1,
      points: 3,
    }),
    ended({ user: "lea" }, "2026-11-24T20:00:00Z", {
      seconds: 900,
      mode: "device",
      session: S2,
      points: 2,
    }),
    opened("lea", "2026-11-25T08:00:00Z", S1),
    ended({ anon: "visitor" }, "2026-11-24T10:00:00Z", { seconds: 60, mode: "device" }),
    // The team's: never counted.
    ended({ user: "staff" }, "2026-11-24T11:00:00Z", {
      seconds: 999,
      mode: "device",
      session: S3,
      points: 1,
    }),
    ended({ user: "marked" }, "2026-11-24T12:00:00Z", { seconds: 999, mode: "device" }),
    ended({ anon: "team-browser" }, "2026-11-22T12:00:00Z", { seconds: 999, mode: "service" }),
    ended({ anon: "someone" }, "2026-11-24T13:00:00Z", {
      seconds: 999,
      mode: "service",
      team: true,
    }),
  ],
};

const page = (data: MiraData, from: string, to: string) =>
  buildMiraPage({
    data,
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});
afterEach(cleanup);

describe("AP › Mira › Voice", () => {
  it("counts the range's voice sessions and their people, a browser that signed up as its account", () => {
    expect(page(DATA, "2026-11-21", "2026-11-29").voice).toEqual({
      sessions: 5,
      people: 2, // Lea (her browser and her account) and the visitor
      median: 300_000, // 1, 2, 5, 10 and 15 minutes
      withPoints: 2,
      opened: 1,
      device: 3,
    });
  });

  it("counts a session in the range it ended in, and an opening only by the range's last day", () => {
    expect(page(DATA, "2026-11-23", "2026-11-24").voice).toEqual({
      sessions: 3,
      people: 2,
      median: 600_000,
      withPoints: 2,
      opened: 0, // Lea opened S1 on the 25th
      device: 3,
    });
    expect(page(DATA, "2026-11-01", "2026-11-20").voice).toMatchObject({
      sessions: 0,
      median: null,
    });
  });

  it("reads the voice events with their props in one filtered read, and fails rather than count part", async () => {
    db.fetch.mockImplementation(async () => new Response("[]", { status: 200 }));
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_event?name=in.(voice_session_ended,voice_points_opened)")
        ? [
            {
              name: "voice_session_ended",
              anon_id: null,
              user_id: "lea",
              created_at: "2026-11-23T20:00:00Z",
              props: {
                seconds: 600,
                mode: "device",
                turns: 4,
                kept: true,
                session: S1,
                points: 3,
                team: true,
              },
            },
          ]
        : []
    );
    const out = await fetchMira();
    expect(out.voice).toEqual([
      {
        name: "voice_session_ended",
        anon_id: null,
        user_id: "lea",
        at: Date.parse("2026-11-23T20:00:00Z"),
        seconds: 600,
        mode: "device",
        session: S1,
        points: 3,
        team: true,
      },
    ]);
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_event?name=in.(voice_") ? null : []
    );
    await expect(fetchMira()).rejects.toThrow(/could not be read/);
  });

  it("shows the card in Engagement & retention, its figures and how each is counted", () => {
    view.payload = page(DATA, "2026-11-21", "2026-11-29");
    render(<ApMira />);
    const card = within(screen.getByRole("region", { name: "Voice" }));
    expect(card.getByText("Voice sessions").closest("div")?.textContent).toContain("5");
    expect(card.getByText("by 2 people")).toBeTruthy();
    expect(card.getByText("Median length").closest("div")?.textContent).toContain("5:00");
    expect(card.getByText("1 of 2 kept sessions with key points")).toBeTruthy();
    expect(card.getByText("Speech on the device").closest("div")?.textContent).toContain("60");
    expect(card.getByText(/Never audio, never words: ids and numbers only/)).toBeTruthy();
  });
});
