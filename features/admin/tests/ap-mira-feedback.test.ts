import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  fetchMira,
  type MiraData,
  type MiraEventRow,
  type MiraUserRow,
} from "@features/admin/server/ap/mira";
import type { MiraFeedbackRow } from "@features/admin/server/ap/mira-feedback";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

/**
 * Decision 11 (22 Nov 2026): /mira/feedback says "Every answer is read by our team", so AP › Mira
 * lists the answers for the team: newest first, with the date and the words, the team's own left
 * out like everywhere on the page.
 */
const TODAY = "2026-12-20";

const user = (id: string, email: string, over: Partial<MiraUserRow> = {}): MiraUserRow => ({
  id,
  email,
  created_at: "2026-11-01T10:00:00Z",
  style: null,
  use_assessment: false,
  ...over,
});
const feedback = (
  who: { user?: string; anon?: string },
  at: string,
  props: Record<string, unknown>
): MiraFeedbackRow => ({
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  created_at: at,
  props: { challenges: [], wish: null, other: null, mayEmail: false, email: null, ...props },
});
const signIn = (anon: string, userId: string, at: string, team?: true): MiraEventRow => ({
  name: "signup_completed",
  anon_id: anon,
  user_id: userId,
  at: Date.parse(at),
  detail: "email",
  ...(team ? { team } : {}),
});

const page = (d: Partial<MiraData>, from = "2026-11-21", to = "2026-11-30") =>
  buildMiraPage({
    data: { users: [], events: [], nudges: [], bodyChecks: [], withResult: new Set(), ...d },
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now: new Date(`${TODAY}T12:00:00Z`),
  });

beforeEach(() => {
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("Beta feedback (AP › Mira)", () => {
  it("lists the range's answers newest first, with the date and the person's own words", () => {
    const d = {
      users: [user("u1", "ana@example.com"), user("u2", "ben@example.com")],
      feedback: [
        feedback({ user: "u1" }, "2026-11-22T09:00:00Z", {
          challenges: ["Low desire"],
          wish: "Remember my goals",
        }),
        feedback({ user: "u2" }, "2026-11-25T18:30:00Z", {
          other: "More voices, please",
          mayEmail: true,
          email: "ben@example.com",
        }),
        // Outside the range on either side.
        feedback({ user: "u1" }, "2026-11-20T22:00:00Z", { other: "before" }),
        feedback({ user: "u1" }, "2026-12-01T08:00:00Z", { other: "after" }),
      ],
    };
    expect(page(d).feedback).toEqual([
      {
        day: "2026-11-25",
        challenges: [],
        wish: null,
        other: "More voices, please",
        email: "ben@example.com",
      },
      {
        day: "2026-11-22",
        challenges: ["Low desire"],
        wish: "Remember my goals",
        other: null,
        email: null,
      },
    ]);
  });

  it("shows an address only where the person said we may email them", () => {
    const d = {
      users: [user("u1", "ana@example.com")],
      feedback: [
        feedback({ user: "u1" }, "2026-11-22T09:00:00Z", {
          other: "hi",
          mayEmail: false,
          email: "ana@example.com",
        }),
      ],
    };
    expect(page(d).feedback?.[0]?.email).toBeNull();
  });

  it("leaves the team out: team addresses, team accounts, team browsers and what they did first", () => {
    const d = {
      users: [
        user("staff", "eva@loveiq.org"),
        user("marked", "sam@example.com", { is_team: true }),
        user("u1", "ana@example.com"),
      ],
      events: [signIn("team-browser-0001", "u9", "2026-11-22T08:00:00Z", true)],
      feedback: [
        feedback({ user: "staff" }, "2026-11-22T09:00:00Z", { other: "staff" }),
        feedback({ user: "marked" }, "2026-11-22T09:01:00Z", { other: "marked" }),
        feedback({ anon: "team-browser-0001" }, "2026-11-22T09:02:00Z", { other: "browser" }),
        feedback({ user: "u1" }, "2026-11-22T09:03:00Z", { other: "probe", team: true }),
        feedback({ user: "u1" }, "2026-11-22T09:04:00Z", { other: "a person" }),
      ],
    };
    expect(page(d).feedback?.map((f) => f.other)).toEqual(["a person"]);
  });

  it("says when the feedback could not be read, instead of an empty list", () => {
    expect(page({ feedback: null }).feedback).toBeNull();
    expect(page({}).feedback).toEqual([]);
  });

  it("reads only the feedback events, newest first, and survives a failed read", async () => {
    mockSupabaseFetch.mockImplementation(async () => new Response("[]", { status: 200 }));
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.includes("name=eq.feedback") ? null : []
    );
    const out = await fetchMira();
    expect(out.feedback).toBeNull();
    const path = mockFetchAllRows.mock.calls
      .map(([p]) => String(p))
      .find((p) => p.includes("name=eq.feedback"));
    expect(path).toBe(
      "/rest/v1/mira_event?name=eq.feedback&select=anon_id,user_id,created_at,props&order=id.desc"
    );
  });
});
