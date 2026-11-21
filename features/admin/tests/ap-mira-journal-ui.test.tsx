// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { JournalFigures } from "@features/admin/server/ap/mira-journal";
import { ApMiraJournal } from "@features/admin/ui/ap/ApMiraJournal";

afterEach(cleanup);

const FIG: JournalFigures = {
  read: true,
  accounts: 40,
  journalers: 12,
  checkIns: 57,
  d7: { returned: 3, of: 8 },
  avgStreak: 2.25,
  reminders: 10,
  sharing: 6,
  notes: 2,
};

const box = (label: string) => screen.getByText(label).closest("div")!;

describe("AP › Mira's journal card", () => {
  it("shows the five figures the journal is judged by", () => {
    render(<ApMiraJournal journal={FIG} />);
    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
    expect(within(box("Checked in at least once")).getByText("12")).toBeInTheDocument();
    expect(screen.getByText("57 check-ins in the range")).toBeInTheDocument();
    expect(within(box("D7 check-in retention")).getByText("37.5%")).toBeInTheDocument();
    expect(screen.getByText("3 of 8 back on day 7 or later")).toBeInTheDocument();
    expect(within(box("Average streak")).getByText("2.3 days")).toBeInTheDocument();
    expect(within(box("Reminder on")).getByText("25.0%")).toBeInTheDocument();
    expect(within(box("Lets Mira read it")).getByText("15.0%")).toBeInTheDocument();
    expect(screen.getByText("6 of 40 accounts, 2 with notes, today")).toBeInTheDocument();
  });

  it("says a failed read is missing, never zero", () => {
    render(<ApMiraJournal journal={{ ...FIG, read: false }} />);
    expect(screen.getByText(/missing, not zero/)).toBeInTheDocument();
    expect(within(box("Checked in at least once")).queryByText("12")).toBeNull();
  });

  it("shows nothing for a page without the journal", () => {
    const { container } = render(<ApMiraJournal />);
    expect(container).toBeEmptyDOMElement();
  });
});
