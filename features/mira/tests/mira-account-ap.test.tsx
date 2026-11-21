// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildMiraPage,
  fetchMira,
  type MiraData,
  type MiraEventRow,
} from "@features/admin/server/ap/mira";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
const db = vi.hoisted(() => ({ fetch: vi.fn(), all: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: db.fetch,
  fetchAllRows: db.all,
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));

import ApMira from "@features/admin/ui/ap/ApMira";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  __resetStaffEmailRegexForTests();
});

const ev = (
  name: string,
  who: { anon?: string; user?: string },
  at: string,
  detail: string | null = null,
  team?: true
): MiraEventRow => ({
  name,
  anon_id: who.anon ?? null,
  user_id: who.user ?? null,
  at: Date.parse(at),
  detail,
  ...(team ? { team } : {}),
});
const account = (id: string, email: string, over = {}) => ({
  id,
  email,
  created_at: "2026-11-02T09:00:00Z",
  style: {},
  use_assessment: false,
  ...over,
});

/**
 * Three people outside the team and one teammate. In the range (16 to 22 Nov): six sign-ins (three
 * by code, one with Google, two with a passkey) and the teammate's passkey sign-in; the offer
 * shown three times and accepted once; one sign-out everywhere; one email change. Two of the three
 * accounts have a passkey today, and so does the teammate.
 */
const DATA: MiraData = {
  users: [
    account("u1", "lea@example.com"),
    account("u2", "kai@example.com"),
    account("u3", "ana@example.com"),
    account("t1", "eman@loveiq.org"),
  ],
  events: [
    ev("signup_completed", { user: "u1", anon: "b1" }, "2026-11-02T09:00:00Z", "email"),
    ev("signup_completed", { user: "u1", anon: "b1" }, "2026-11-17T09:00:00Z", "email"),
    ev("signup_completed", { user: "u2", anon: "b2" }, "2026-11-17T10:00:00Z", "email"),
    ev("signup_completed", { user: "u3", anon: "b3" }, "2026-11-18T10:00:00Z", "email"),
    ev("signup_completed", { user: "u2", anon: "b4" }, "2026-11-19T10:00:00Z", "google"),
    ev("signup_completed", { user: "u1", anon: "b5" }, "2026-11-20T10:00:00Z", "passkey"),
    ev("signup_completed", { user: "u2", anon: "b2" }, "2026-11-21T10:00:00Z", "passkey"),
    ev("signup_completed", { user: "t1", anon: "t" }, "2026-11-21T10:00:00Z", "passkey"),
    ev("passkey_offer_shown", { user: "u1" }, "2026-11-17T09:01:00Z"),
    ev("passkey_offer_shown", { user: "u2" }, "2026-11-17T10:01:00Z"),
    ev("passkey_offer_shown", { user: "u3" }, "2026-11-18T10:01:00Z"),
    ev("passkey_offer_shown", { user: "t1" }, "2026-11-18T10:01:00Z"),
    ev("passkey_offer_accepted", { user: "u1" }, "2026-11-17T09:02:00Z"),
    ev("passkey_offer_accepted", { user: "t1" }, "2026-11-18T10:02:00Z"),
    ev("signed_out_everywhere", { user: "u2" }, "2026-11-21T11:00:00Z"),
    ev("signed_out_everywhere", { user: "u2" }, "2026-11-10T11:00:00Z"), // before the range
    ev("email_changed", { user: "u3" }, "2026-11-22T08:00:00Z"),
    ev("email_changed", { anon: "x" }, "2026-11-22T08:00:00Z", null, true), // a team browser
  ],
  nudges: [],
  bodyChecks: [],
  withResult: new Set(),
  passkeyUsers: ["u1", "u2", "t1"],
};
const page = (data: MiraData) =>
  buildMiraPage({
    data,
    filters: parseFilters({ period: "custom", from: "2026-11-16", to: "2026-11-22" }, "2026-11-22"),
    today: "2026-11-22",
    now: new Date("2026-11-22T12:00:00Z"),
  });

describe("AP › Mira › Sign-in", () => {
  it("counts sign-ins by method, passkeys, the offer and safety moments, the team left out", () => {
    expect(page(DATA).signIn).toEqual({
      byMethod: { email: 3, google: 1, passkey: 2 },
      passkeys: { accounts: 2, of: 3 },
      offer: { shown: 3, accepted: 1 },
      signedOutEverywhere: 1,
      emailChanges: 1,
    });
  });

  it("leaves adoption unmeasured when the passkeys can't be read, and keeps the page", async () => {
    expect(page({ ...DATA, passkeyUsers: null }).signIn.passkeys).toBeNull();
    db.fetch.mockImplementation(async () => new Response("[]", { status: 200 }));
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_passkey") ? null : []
    );
    expect((await fetchMira()).passkeyUsers).toBeNull();
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_passkey") ? [{ user_id: "u1" }] : []
    );
    expect((await fetchMira()).passkeyUsers).toEqual(["u1"]);
    // The events the card reads are among those AP asks Mira's table for.
    const asked = db.fetch.mock.calls.find(([p]) => p === "/rest/v1/rpc/mira_ap_events")!;
    expect(JSON.parse(String(asked[1].body)).p_names).toEqual(
      expect.arrayContaining([
        "signup_completed",
        "passkey_offer_shown",
        "passkey_offer_accepted",
        "signed_out_everywhere",
        "email_changed",
      ])
    );
  });

  it("shows the card on the page", () => {
    view.payload = page(DATA);
    render(<ApMira />);
    const card = screen.getByRole("region", { name: "Sign-in" });
    const box = (label: string) => within(card).getByText(label).closest("div")!;
    expect(within(box("With a passkey")).getByText("2")).toBeInTheDocument();
    expect(
      within(box("Accounts with a passkey")).getByText("2 of 3 accounts, today")
    ).toBeInTheDocument();
    expect(
      within(box("“Use Face ID next time?” accepted")).getByText("1 of 3 times shown")
    ).toBeInTheDocument();
    expect(within(box("Changed their email")).getByText("1")).toBeInTheDocument();
  });
});
