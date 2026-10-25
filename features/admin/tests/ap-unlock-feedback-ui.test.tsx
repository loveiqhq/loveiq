// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildUnlockFeedbackPage,
  parseUnlockFeedback,
} from "@features/admin/server/ap/unlock-feedback";

const view = vi.hoisted(() => ({ payload: null as unknown, bar: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({
  default: (props: unknown) => {
    view.bar = props;
    return null;
  },
}));
vi.mock("@features/admin/ui/ap/csv", () => ({ exportTables: vi.fn() }));

import ApUnlockFeedback from "@features/admin/ui/ap/ApUnlockFeedback";
import { KpiTileV2 } from "@features/admin/ui/ap/kit";
import { activeKey, NAV } from "@features/admin/ui/ap/nav";

const AFTER = { reached: {}, read_ms: 0, closed: 0, ups: 0, downs: 0, shared: false };
const answer = (reason: string, over: Record<string, unknown> = {}) => ({
  day: "2026-10-20",
  arm: "A",
  sent_at: "2026-10-20T08:00:00Z",
  src: "google",
  med: "cpc",
  delivered_at: "2026-10-20T08:00:05Z",
  clicked_at: "2026-10-20T08:30:00Z",
  reason,
  answered_at: "2026-10-20T08:30:10Z",
  loads: 1,
  chips: [],
  note: null,
  device: "mobile",
  already_paid: false,
  unlocked_at: "2026-10-20T08:30:11Z",
  gender: "Woman",
  age: "25–34",
  archetype: "Spark Seeker",
  after: AFTER,
  ...over,
});

const rows = [
  ...Array.from({ length: 21 }, () => answer("too_expensive", { chips: ["About half the price"] })),
  answer("privacy", {
    device: "desktop",
    chips: ["Seeing it on my bank statement"],
    note: "Didn’t want it on our bank statement. Text me on 0151 2345678",
    detail_at: "2026-10-21T19:02:00Z",
  }),
  answer("other", {
    note: "Thought it was a subscription.",
    detail_at: "2026-10-21T21:30:00Z",
  }),
];

function payload(firstSent: string | null = "2026-10-19") {
  return buildUnlockFeedbackPage({
    data: parseUnlockFeedback({ rows: firstSent ? rows : [], paid: [], first_sent: firstSent }),
    previous: null,
    filters: parseFilters({ period: "custom", from: "2026-10-19", to: "2026-10-25" }, "2026-10-26"),
    today: "2026-10-26",
    now: new Date("2026-10-26T10:00:00Z"),
  });
}

afterEach(cleanup);

describe("the Unlock feedback page", () => {
  it("draws every section of the design, the subject test and data quality too", () => {
    view.payload = payload();
    render(<ApUnlockFeedback />);
    for (const h of [
      "From send to answer",
      "Data quality",
      "Why they didn’t unlock",
      "Reasons by segment",
      "Answers per day after send",
      "Subject test",
      "After the free unlock",
      "Written answers",
    ]) {
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    }
    expect(screen.getByText("Epic running · day 8")).toBeTruthy();
    expect(
      screen.getByText(
        "Share of 23 confirmed answers. Pick a reason to see what people added on the follow-up page."
      )
    ).toBeTruthy();
    // The tile's own line, as the design writes it under the value.
    expect(screen.getByText("100.0% of 23 sent")).toBeTruthy();
    expect(screen.getByText("No reminder in this version")).toBeTruthy();
    expect(screen.getByText("One tap, and your full LoveIQ report is yours, free")).toBeTruthy();
    // Bots are taken off the raw clicks, with the real minus sign only when there are any.
    expect(screen.queryByText(/^−/)).toBeNull();
  });

  it("fixes the filters the page cannot apply, and says why", () => {
    view.payload = payload();
    render(<ApUnlockFeedback />);
    expect(view.bar).toMatchObject({
      scope: "assessment",
      // Its emails go to free survey readers only: the Funnel filter has nothing to narrow.
      fixed: ["funnel", "source", "device", "tier", "visitor"],
    });
  });

  it("shows a picked reason's follow-up chips and words", () => {
    view.payload = payload();
    render(<ApUnlockFeedback />);
    const aside = screen.getByRole("complementary", { name: "Selected reason" });
    expect(within(aside).getByText("More than I wanted to pay")).toBeTruthy();
    expect(within(aside).getByText("What would have felt fair?")).toBeTruthy();
    expect(within(aside).getByText("21 answers · 21 added detail (100%)")).toBeTruthy();

    const privacy = screen.getByRole("button", { name: /Paying felt too personal/ });
    expect(privacy.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(privacy);
    expect(privacy.getAttribute("aria-pressed")).toBe("true");
    expect(within(aside).getByText("What gave them pause?")).toBeTruthy();
    expect(within(aside).getByText("Seeing it on my bank statement")).toBeTruthy();
    // The reader's words, masked on the server: no phone number reaches the page.
    expect(
      within(aside).getByText("“Didn’t want it on our bank statement. Text me on [masked]”")
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/2345678/);
  });

  it("greys out the groups under 20 answers", () => {
    view.payload = payload();
    render(<ApUnlockFeedback />);
    const table = screen.getByRole("table", { name: "Reasons by segment" });
    const row = within(table).getByRole("rowheader", {
      name: "More than I wanted to pay",
    }).parentElement!;
    const cells = within(row).getAllByRole("cell");
    // Mobile: 22 answers, 21 of them this reason, in the heat's purple.
    expect(cells[0]!.textContent).toBe("95%");
    expect(cells[0]!.className).not.toMatch(/text-ap-quiet/);
    // Desktop: one answer, greyed.
    expect(cells[1]!.textContent).toBe("0%");
    expect(cells[1]!.className).toMatch(/text-ap-quiet/);
  });

  it("searches the written answers, newest first", () => {
    view.payload = payload();
    render(<ApUnlockFeedback />);
    const table = screen.getByRole("table", { name: "Written answers" });
    const texts = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[2]!.textContent);
    expect(texts()).toEqual([
      "Thought it was a subscription.",
      "Didn’t want it on our bank statement. Text me on [masked]",
    ]);
    fireEvent.change(screen.getByLabelText("Search answers"), { target: { value: "BANK" } });
    expect(texts()).toEqual(["Didn’t want it on our bank statement. Text me on [masked]"]);
    fireEvent.change(screen.getByLabelText("Search answers"), { target: { value: "partner" } });
    expect(within(table).getByText("No answer matches the search.")).toBeTruthy();
  });

  it("says so before the first email", () => {
    view.payload = payload(null);
    render(<ApUnlockFeedback />);
    expect(screen.getByText("Not sent yet")).toBeTruthy();
    expect(
      screen.getByText(
        "The email has not been sent yet: every figure here starts with the first send."
      )
    ).toBeTruthy();
    expect(screen.getByText("No written answers in this range.")).toBeTruthy();
  });
});

describe("a tile with its own line", () => {
  it("writes the change against the period before, then the line", () => {
    render(
      <KpiTileV2
        foot
        tile={{
          key: "delivered",
          label: "Delivered",
          unit: "count",
          value: 2,
          prev: 1,
          goodWhen: "up",
          spark: [1, 2],
          foot: "50.0% of 4 sent",
          blocked: null,
          trend: "",
        }}
      />
    );
    const change = screen.getByText("+100.0% ·");
    expect(change.className).toMatch(/text-ap-good/);
    expect(change.parentElement!.textContent).toBe("+100.0% · 50.0% of 4 sent");
  });
});

describe("the sidebar", () => {
  it("lists Unlock feedback after Payment and Pay to start, and lights it on its page", () => {
    const items = NAV.flatMap((g) => g.items);
    const i = items.findIndex((x) => x.key === "a-payment");
    expect(items[i + 1]).toMatchObject({ key: "a-pay-to-start" });
    expect(items[i + 2]).toMatchObject({
      key: "a-unlock",
      label: "Unlock feedback",
      href: "/admin/ap/assessment-a/unlock-feedback",
      level: 2,
    });
    expect(activeKey("/admin/ap/assessment-a/unlock-feedback")).toBe("a-unlock");
  });
});
