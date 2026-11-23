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
// Whether the link's own account is signed in: beyond a stop, the page needs it (SEC-R4-2).
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));

import NudgesPage from "@/app/mira/nudges/page";
import { makeToken } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import { miraApi } from "@features/mira/ui/api";
import MiraNudges from "@features/mira/ui/MiraNudges";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-nudges-0123456789";
const LEA = "11111111-2222-4333-8444-555555555555";
/** The sign-in, coming back to this page. */
const SIGN_IN = "/mira/start?next=%2Fmira%2Fnudges";

const PREFS = {
  frequency: "Every day",
  kinds: "All kinds",
  time: "08:00",
  next: "Wednesday, 08:00 your time",
  paused: false,
  stopped: false,
};

beforeEach(() => {
  vi.mocked(getMiraAccount).mockResolvedValue({ id: LEA, email: "lea@example.com" });
  vi.mocked(miraApi).mockReset();
  vi.mocked(miraApi).mockImplementation((async (_url: string, init?: { body?: unknown }) =>
    (init?.body as { action?: string } | undefined)?.action === "read"
      ? { ok: true, status: 200, data: { prefs: PREFS, types: null } }
      : {
          ok: true,
          status: 200,
          data: { prefs: { ...PREFS, next: null, stopped: true } },
        }) as never);
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
    // DATA-1: the token goes in the body, never in an address (logs, analytics).
    expect(vi.mocked(miraApi).mock.calls[0]).toEqual([
      "/api/mira/nudges/preferences",
      { body: { action: "read", t: signed } },
    ]);
  });

  it("moves focus to each new screen's heading, and the reason screen has a way back", async () => {
    const user = userEvent.setup();
    render(<MiraNudges token="signed-token" signedIn />);
    const choose = await screen.findByRole("heading", { name: "Fewer nudges, not none?" });
    await waitFor(() => expect(choose).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Stop all nudges" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "What made you stop?" })).toHaveFocus()
    );
    // Words for every way of choosing, not only a finger (A11Y-16).
    expect(
      screen.getByText("Your answer helps Mira write better nudges. It’s optional.")
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/\btap\b/i);
    // Its note box sits on the paper colour in both themes, not the browser's grey (UX-7).
    expect(screen.getByRole("textbox", { name: /Anything else/ })).toHaveClass("bg-white");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Fewer nudges, not none?" })).toHaveFocus()
    );
  });

  it("thanks only someone who told us why, and Talk to Mira opens the chat", async () => {
    const user = userEvent.setup();
    render(<MiraNudges token="signed-token" signedIn />);
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
    render(<MiraNudges token="signed-token" signedIn />);
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

// Round-4 security SEC-R4-2: the link is the account id signed, never expires and stays in every
// inbox the email reached, an address the person has since left too. Alone it may only stop.
describe("the link alone, without the account's own sign-in", () => {
  it("can only stop, and sends the person to sign in, then back here, for the rest", async () => {
    const user = userEvent.setup();
    render(<MiraNudges token="signed-token" />);
    const choose = screen.getByRole("heading", { name: "Fewer nudges, not none?" });
    await waitFor(() => expect(choose).toHaveFocus());
    expect(miraApi).not.toHaveBeenCalled(); // the choices are never read
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save my choice" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to choose" })).toHaveAttribute(
      "href",
      SIGN_IN
    );
    await user.click(screen.getByRole("button", { name: "Stop all nudges" }));
    await user.click(screen.getByRole("button", { name: "Stop nudges" }));
    await screen.findByRole("heading", { name: "Mira won’t email you anymore" });
    expect(vi.mocked(miraApi).mock.calls.map(([, init]) => init?.body)).toEqual([
      { t: "signed-token", action: "stop", reason: null, note: null },
    ]);
    expect(screen.queryByRole("button", { name: /back on/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Changed your mind? Sign in to turn nudges back on" })
    ).toHaveAttribute("href", SIGN_IN);
  });

  it("is what the page gives a visitor who isn't that account, signed out or signed in as another", async () => {
    jar.set("mira_link", makeToken("prefs", LEA)!);
    const page = NudgesPage as () => Promise<never>;
    for (const someone of [null, { id: "22222222-3333-4444-8555-666666666666", email: "x@y.z" }]) {
      vi.mocked(getMiraAccount).mockResolvedValue(someone);
      render(await page());
      expect(screen.getByRole("link", { name: "Sign in to choose" })).toBeVisible();
      cleanup();
    }
    expect(miraApi).not.toHaveBeenCalled();
    // The link's own account: its choices, read and changed here.
    vi.mocked(getMiraAccount).mockResolvedValue({ id: LEA, email: "lea@example.com" });
    render(await page());
    expect(await screen.findByRole("radio", { name: /Twice a week/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Sign in to choose" })).toBeNull();
  });
});
