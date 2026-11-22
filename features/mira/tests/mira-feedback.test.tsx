// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/mira/ui/api", () => ({
  miraApi: vi.fn(async () => ({ ok: true, status: 200, data: { success: true } })),
  useReloadWhenRestored: () => undefined,
}));

import { miraApi } from "@features/mira/ui/api";
import MiraFeedback from "@features/mira/ui/MiraFeedback";

beforeEach(() => vi.mocked(miraApi).mockClear());
afterEach(cleanup);

/** Board 10, /mira/feedback: what the form sends, and how it sits on a phone in either theme. */
describe("the beta feedback form", () => {
  it("sends nothing empty: it asks for a challenge or a few words first", async () => {
    const user = userEvent.setup();
    render(<MiraFeedback />);
    await user.click(screen.getByRole("checkbox", { name: /You may email me/ }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick a challenge or write a few words first."
    );
    expect(miraApi).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Any other ideas or feedback?" }), "  ");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(miraApi).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Low desire" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(miraApi).toHaveBeenCalledWith("/api/mira/event", {
      body: {
        type: "feedback",
        challenges: ["Low desire"],
        wish: undefined,
        other: undefined,
        mayEmail: true,
      },
    });
    expect(await screen.findByText("Thank you. Your feedback is with the team.")).toBeVisible();
  });

  it("sends words alone too", async () => {
    const user = userEvent.setup();
    render(<MiraFeedback />);
    await user.type(
      screen.getByRole("textbox", { name: "What do you wish Mira could do?" }),
      "Remember my goals"
    );
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(vi.mocked(miraApi).mock.calls[0]![1]).toMatchObject({
      body: { challenges: [], wish: "Remember my goals" },
    });
  });

  it("draws its fields on the paper colour, never the browser's grey (UX-7)", () => {
    render(<MiraFeedback />);
    for (const box of screen.getAllByRole("textbox")) expect(box).toHaveClass("bg-white");
  });

  it("keeps the checkbox its size and the Send pill on one line on a phone (A11Y-17, UX-8)", () => {
    render(<MiraFeedback />);
    expect(screen.getByRole("checkbox", { name: /You may email me/ })).toHaveClass("shrink-0");
    // The note beside the pill wraps under it instead of squeezing its label onto two lines.
    expect(screen.getByRole("button", { name: "Send feedback" }).parentElement).toHaveClass(
      "flex-wrap"
    );
  });
});
