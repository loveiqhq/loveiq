// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { FeedbackItem } from "@features/admin/server/ap/mira-feedback";
import { ApMiraFeedback } from "@features/admin/ui/ap/ApMiraFeedback";

afterEach(cleanup);

const ITEMS: FeedbackItem[] = [
  {
    day: "2026-11-25",
    challenges: [],
    wish: null,
    other: "More voices, please",
    email: "ben@example.com",
  },
  {
    day: "2026-11-22",
    challenges: ["Low desire", "Body confidence"],
    wish: "Remember my goals",
    other: null,
    email: null,
  },
];

describe("AP › Mira's Beta feedback list", () => {
  it("shows each answer, newest first, with its day, the person's words and a way to reply", () => {
    render(<ApMiraFeedback feedback={ITEMS} />);
    expect(screen.getByRole("heading", { name: "Beta feedback" })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("25 Nov");
    expect(first).toHaveTextContent("More voices, please");
    expect(within(first!).getByRole("link", { name: "ben@example.com" })).toHaveAttribute(
      "href",
      "mailto:ben@example.com"
    );
    expect(second).toHaveTextContent("22 Nov");
    expect(second).toHaveTextContent("Low desire, Body confidence");
    expect(second).toHaveTextContent("Remember my goals");
    expect(within(second!).queryByRole("link")).toBeNull();
  });

  it("says when there is nothing in the range, and when the list could not be read", () => {
    render(<ApMiraFeedback feedback={[]} />);
    expect(screen.getByText("No feedback in the range.")).toBeInTheDocument();
    cleanup();
    render(<ApMiraFeedback feedback={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/);
  });
});
