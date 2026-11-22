// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/mira/ui/api", () => ({
  miraApi: vi.fn(async () => ({ ok: true, status: 200, data: { success: true } })),
  useReloadWhenRestored: () => undefined,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({}) }));
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: async () => ({ id: "u1", email: "lea@example.com" }),
}));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn(async () => false) }));

import type { ReactElement } from "react";
import FeedbackPage from "@/app/mira/feedback/page";
import { COACHES } from "@features/mira/content/coaches";
import { isMinor } from "@features/mira/server/minor";
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

    await user.click(screen.getByRole("button", { name: "Libido challenges" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(miraApi).toHaveBeenCalledWith("/api/mira/event", {
      body: {
        type: "feedback",
        challenges: ["Libido challenges"],
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

  // Decision 9: refused as under 18 (the route keeps nothing of it), it says the one refusal in
  // place of the form, never an error inviting another send.
  it("says 'Mira is only for adults.' in place of the form when the send is refused as under 18", async () => {
    const user = userEvent.setup();
    vi.mocked(miraApi).mockResolvedValueOnce({
      ok: false,
      status: 403,
      minor: true,
      data: { error: "Mira is only for adults.", minor: true },
    } as never);
    render(<MiraFeedback />);
    await user.click(screen.getByRole("button", { name: "Libido challenges" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Mira is only for adults.")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send feedback" })).toBeNull();
    expect(screen.queryByText("Thank you. Your feedback is with the team.")).toBeNull();
  });

  // Round-3 R3-DATA-5: an account stopped as under 18 was shown the whole form and refused only
  // after writing and sending. The page reads the stop, and the form gives way to it at once.
  it("says 'Mira is only for adults.' from the start for an account stopped as under 18", async () => {
    vi.mocked(isMinor).mockResolvedValueOnce(true);
    const page = (await FeedbackPage()) as ReactElement<{ minor?: boolean }>;
    expect(isMinor).toHaveBeenCalledWith("u1");
    expect(page.props.minor).toBe(true);
    expect(((await FeedbackPage()) as ReactElement<{ minor?: boolean }>).props.minor).toBe(false);
    render(<MiraFeedback minor />);
    expect(screen.getByText("Mira is only for adults.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send feedback" })).toBeNull();
    expect(miraApi).not.toHaveBeenCalled();
  });

  it("draws its fields on the paper colour with a visible edge, never the browser's grey (UX-7, A11Y-8)", () => {
    render(<MiraFeedback />);
    for (const box of screen.getAllByRole("textbox")) {
      expect(box).toHaveClass("bg-white");
      expect(box).toHaveClass("border-ap-field"); // 3:1 against the page in both themes
    }
  });

  it("names each challenge as the coaches page does, one name per thing (SET-11)", () => {
    render(<MiraFeedback />);
    for (const { challenge } of COACHES) {
      expect(screen.getByRole("button", { name: challenge })).toBeVisible();
    }
    for (const old of ["Low desire", "Different levels of desire", "Saying what I want"]) {
      expect(screen.queryByRole("button", { name: old })).toBeNull();
    }
    // The challenges no coach covers yet stay on offer.
    for (const more of ["Performance pressure", "Trust after cheating", "Another challenge"]) {
      expect(screen.getByRole("button", { name: more })).toBeVisible();
    }
  });

  it("keeps the checkbox its size and the Send pill on one line on a phone (A11Y-17, UX-8)", () => {
    render(<MiraFeedback />);
    expect(screen.getByRole("checkbox", { name: /You may email me/ })).toHaveClass("shrink-0");
    // The pill never shrinks, and the note beside it wraps under it instead of squeezing it.
    const pill = screen.getByRole("button", { name: "Send feedback" }).parentElement!;
    expect(pill).toHaveClass("shrink-0");
    expect(pill.parentElement).toHaveClass("flex-wrap");
  });
});
