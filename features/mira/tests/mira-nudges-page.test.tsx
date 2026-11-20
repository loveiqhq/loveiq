// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("t=signed-token"),
}));
vi.mock("@features/mira/ui/api", () => ({ miraApi: vi.fn() }));

import NudgesPage from "@/app/mira/nudges/page";
import { makeToken } from "@features/mira/server/nudges";
import { miraApi } from "@features/mira/ui/api";
import MiraNudges from "@features/mira/ui/MiraNudges";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-nudges-0123456789";

const PREFS = {
  frequency: "Every day",
  kinds: "All kinds",
  time: "08:00",
  next: "Wednesday, 08:00 your time",
  paused: false,
  stopped: false,
};

beforeEach(() => {
  vi.mocked(miraApi).mockReset();
  vi.mocked(miraApi).mockImplementation((async (_url: string, init?: { body?: unknown }) =>
    init?.body
      ? { ok: true, status: 200, data: { prefs: { ...PREFS, next: null, stopped: true } } }
      : { ok: true, status: 200, data: { prefs: PREFS, types: null } }) as never);
});
afterEach(cleanup);

describe("the nudge preferences page (boards 2 to 4b)", () => {
  it("shows a link we did not sign as broken at once, with no request that could only fail", async () => {
    const open = async (t: string) =>
      render(await NudgesPage({ searchParams: Promise.resolve({ t }) }));
    await open("11111111-2222-4333-8444-555555555555.forged");
    expect(screen.getByRole("heading", { name: "This link doesn’t work anymore" })).toBeVisible();
    expect(miraApi).not.toHaveBeenCalled();
    cleanup();
    await open(makeToken("prefs", "11111111-2222-4333-8444-555555555555")!);
    expect(await screen.findByRole("heading", { name: "Fewer nudges, not none?" })).toBeVisible();
    expect(miraApi).toHaveBeenCalledTimes(1);
  });

  it("moves focus to each new screen's heading, and the reason screen has a way back", async () => {
    const user = userEvent.setup();
    render(<MiraNudges />);
    const choose = await screen.findByRole("heading", { name: "Fewer nudges, not none?" });
    await waitFor(() => expect(choose).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Stop all nudges" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "What made you stop?" })).toHaveFocus()
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fewer nudges, not none?" })).toHaveFocus()
    );
  });

  it("thanks only someone who told us why, and Talk to Mira opens the chat", async () => {
    const user = userEvent.setup();
    render(<MiraNudges />);
    await user.click(await screen.findByRole("button", { name: "Stop all nudges" }));
    await user.click(screen.getByRole("radio", { name: "Too many emails" }));
    await user.click(screen.getByRole("button", { name: "Skip and stop nudges" }));
    await screen.findByRole("heading", { name: "Mira won’t email you anymore" });
    expect(vi.mocked(miraApi).mock.calls.at(-1)![1]!.body).toMatchObject({
      action: "stop",
      reason: null,
    });
    expect(screen.getByText(/You’ve stopped all nudges\./).textContent).not.toContain("Thank you");
    expect(screen.getByRole("link", { name: "Talk to Mira" })).toHaveAttribute("href", "/mira");
  });
});
