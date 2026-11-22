// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The link's token comes from the `mira_link` cookie proxy.ts sets (decision 10), never the address.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
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
    /** The page as an email link opens it: its token in the cookie, maybe an old `?t=` too. */
    const open = async (cookie: string | null, address?: string) => {
      jar.clear();
      if (cookie !== null) jar.set("mira_link", cookie);
      // Next still hands the page its address; it must take nothing from it.
      const page = NudgesPage as (p: { searchParams: Promise<{ t?: string }> }) => Promise<never>;
      render(await page({ searchParams: Promise.resolve({ t: address }) }));
    };
    const signed = makeToken("prefs", "11111111-2222-4333-8444-555555555555")!;
    await open("11111111-2222-4333-8444-555555555555.forged");
    expect(screen.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
    cleanup();
    // A token left in the address counts for nothing: the cookie is the only way in.
    await open(null, signed);
    expect(screen.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
    expect(miraApi).not.toHaveBeenCalled();
    cleanup();
    await open(signed);
    expect(await screen.findByRole("heading", { name: "Fewer nudges, not none?" })).toBeVisible();
    expect(miraApi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(miraApi).mock.calls[0]![0]).toBe(
      `/api/mira/nudges/preferences?t=${encodeURIComponent(signed)}`
    );
  });

  it("moves focus to each new screen's heading, and the reason screen has a way back", async () => {
    const user = userEvent.setup();
    render(<MiraNudges token="signed-token" />);
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
    render(<MiraNudges token="signed-token" />);
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

  it("says that journal and session reminders stop too, before and after, and where they come back", async () => {
    const user = userEvent.setup();
    render(<MiraNudges token="signed-token" />);
    await user.click(await screen.findByRole("button", { name: "Stop all nudges" }));
    expect(
      screen.getByText(
        "Stopping also turns off your journal reminder and pauses your weekly session’s reminders."
      )
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop nudges" }));
    await screen.findByRole("heading", { name: "Mira won’t email you anymore" });
    expect(
      screen.getByText(
        /Your journal reminder is off and your weekly session’s reminders are paused too\./
      )
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Settings › Notifications" })).toHaveAttribute(
      "href",
      "/mira/settings#notifications"
    );
  });
});
