// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildEmailsPage, type EmailsData, type Msg } from "@features/admin/server/ap/emails";
import { parseFilters } from "@features/admin/server/ap/filters";

const view = vi.hoisted(() => ({
  payload: null as unknown,
  url: "",
  query: null as unknown,
  bar: null as unknown,
}));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string, query: unknown) => {
    view.url = url;
    view.query = query;
    return { data: view.payload, loading: false, error: null, refetch: () => {} };
  },
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({
  useApFilters: () => ({ params: { period: "30d" } }),
}));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({
  default: (props: unknown) => {
    view.bar = props;
    return null;
  },
}));
vi.mock("@features/admin/ui/ap/csv", () => ({ exportTables: vi.fn() }));

import ApEmails from "@features/admin/ui/ap/ApEmails";
import { activeKey, NAV } from "@features/admin/ui/ap/nav";

afterEach(cleanup);

const msg = (stage: string, day: string, over: Partial<Msg> = {}): Msg => ({
  stage,
  variant: null,
  sentAt: `${day}T09:00:00Z`,
  deliveredAt: `${day}T09:00:05Z`,
  openedAt: null,
  clickedAt: null,
  bouncedAt: null,
  complainedAt: null,
  src: "google",
  med: "cpc",
  goalAt: null,
  goalReason: null,
  ...over,
});

function payload(scope: "overall" | "assessment") {
  const data: EmailsData = {
    msgs: [
      ...Array.from({ length: 24 }, (_, i) =>
        msg("unlock_feedback", "2026-11-12", { variant: i % 2 ? "A" : "B" })
      ),
      ...Array.from({ length: 22 }, () =>
        msg("72h_no_unlock", "2026-11-13", { clickedAt: "2026-11-14T10:00:00Z" })
      ),
      msg("invite_reminder_1", "2026-11-13"),
    ],
    tallies: [{ experiment: "survey-paused", arm: "a", day: "2026-11-12", event: "sent", n: 3 }],
    unsubs: [],
    finished: [{ day: "2026-11-12", src: "google", med: "cpc", n: 40 }],
  };
  return buildEmailsPage({
    data,
    previous: null,
    filters: parseFilters({ period: "custom", from: "2026-11-11", to: "2026-11-17" }, "2026-11-20"),
    scope,
    today: "2026-11-20",
    now: new Date("2026-11-20T09:00:00Z"),
  });
}

const tableRows = () =>
  within(screen.getByRole("table", { name: "Every email" }))
    .getAllByRole("row")
    .slice(1, -1) // the header row and the total row
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("the Emails page", () => {
  it("reads its scope's page and shows the design's sections", () => {
    view.payload = payload("overall");
    render(<ApEmails scope="overall" />);
    expect(view.url).toBe("/api/admin/ap/emails");
    expect(view.query).toEqual({ period: "30d", scope: "overall" });
    expect(screen.getByRole("heading", { level: 1, name: "Emails" })).toBeTruthy();
    for (const h of ["All emails", "By assessment", "Every email", "Week by week"]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
    // The bar shows the narrowing filters fixed: every email over all traffic.
    expect(view.bar).toMatchObject({
      scope: "overall",
      fixed: ["funnel", "source", "device", "tier", "visitor"],
    });
  });

  it("lists each email with its versions under it, and a goal it can't read as not tracked", () => {
    view.payload = payload("overall");
    render(<ApEmails scope="overall" />);
    const names = tableRows();
    const i = names.findIndex((n) => n?.startsWith("Why didn’t you unlock?"));
    expect(names.slice(i + 1, i + 3)).toEqual(["Version A", "Version B"]);
    const paused = within(screen.getByRole("table", { name: "Every email" }))
      .getAllByRole("row")
      .find((r) => r.textContent?.startsWith("Survey paused"))!;
    expect(paused.textContent).toMatch(/not tracked/);
  });

  it("filters by tab and by search, and sorts with the versions kept under their email", () => {
    view.payload = payload("assessment");
    render(<ApEmails scope="assessment" />);
    expect(screen.queryByRole("heading", { name: "By assessment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sharing" }));
    expect(tableRows().some((n) => n?.startsWith("Invite reminder · day 3"))).toBe(true);
    expect(tableRows().some((n) => n?.startsWith("Still locked"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "All funnels" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search emails" }), {
      target: { value: "72 HOURS" },
    });
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toMatch(/^Still locked after 72 hours/);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search emails" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Sent" }));
    const sorted = tableRows();
    expect(sorted[0]).toMatch(/^Why didn’t you unlock\?/);
    expect(sorted.slice(1, 3)).toEqual(["Version A", "Version B"]);
    expect(sorted[3]).toMatch(/^Still locked after 72 hours/);
  });

  it("marks the best and worst rate in words for a screen reader, not by colour alone", () => {
    view.payload = payload("overall");
    render(<ApEmails scope="overall" />);
    expect(screen.getAllByText(/\(best\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\(worst\)/).length).toBeGreaterThan(0);
  });
});

describe("the sidebar", () => {
  it("lists Emails under Reports and under Assessment A, and Promotional emails as soon", () => {
    const reports = NAV.find((g) => g.title === "Reports")!.items;
    expect(reports.map((x) => x.key)).toEqual(["focus", "emails", "promo"]);
    expect(reports[1]).toMatchObject({ label: "Emails", href: "/admin/ap/emails", level: 1 });
    expect(reports[2]).toMatchObject({ label: "Promotional emails", href: "", badge: "soon" });
    const items = NAV.flatMap((g) => g.items);
    const i = items.findIndex((x) => x.key === "a-unlock");
    expect(items[i + 1]).toMatchObject({
      key: "a-emails",
      href: "/admin/ap/assessment-a/emails",
      level: 2,
    });
    expect(activeKey("/admin/ap/emails")).toBe("emails");
    expect(activeKey("/admin/ap/assessment-a/emails")).toBe("a-emails");
  });
});
