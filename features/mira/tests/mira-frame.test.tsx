// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
const nav = vi.hoisted(() => ({ path: "/mira/home" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => nav.path,
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
const posthog = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const session = vi.hoisted(() => ({ account: null as null | { id: string; email: string } }));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: async () => session.account }));
const server = vi.hoisted(() => ({
  profile: null as null | { name: string | null; time_zone: string; country: string | null },
  hadCrisis: async (_id: string, _since: Date): Promise<boolean> => false,
}));
vi.mock("@features/mira/server/store", () => ({ getProfile: async () => server.profile }));
vi.mock("@features/mira/server/nudges", async (original) => ({
  ...(await original<typeof import("@features/mira/server/nudges")>()),
  hadCrisis: (id: string, since: Date) => server.hadCrisis(id, since),
}));
const stop = vi.hoisted(() => ({ isMinor: async (_id: string | null): Promise<boolean> => false }));
vi.mock("@features/mira/server/minor", () => ({
  isMinor: (id: string | null) => stop.isMinor(id),
}));

import MiraError from "@/app/mira/error";
import HomePage from "@/app/mira/home/page";
import MiraLayout from "@/app/mira/layout";
import { MiraLookRoot } from "@features/mira/ui/MiraLook";
import { DEFAULT_LOOK } from "@features/mira/ui/prefs";
import MissingPage from "@/app/mira/[...missing]/page";
import MiraNotFound, { metadata as notFoundMetadata } from "@/app/mira/not-found";
import { generateMetadata as checkMetadata } from "@/app/mira/assessments/[check]/page";
import { generateMetadata as recordingMetadata } from "@/app/mira/recordings/[id]/page";
import GuideLayout from "@/app/mira/guide/layout";
import MiraHome from "@features/mira/ui/MiraHome";
import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { PrimaryButton, Wordmark } from "@features/mira/ui/MiraShell";
import { ADULTS_ONLY, AdultsOnly, ConfirmDelete, SectionLink } from "@features/mira/ui/kit";
import { shortDate } from "@features/mira/ui/kit/dates";

/**
 * The round-2 audit's frame and shared parts (22 Nov 2026): the ink button, the signed-in frame,
 * Home, and the parts every stream shares (features/mira/ui/kit).
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.values(router).forEach((f) => f.mockClear());
});

describe("PrimaryButton (decision 7, A11Y-1)", () => {
  it("while disabled keeps keyboard focus, ignores the click and cancels its form's submit", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PrimaryButton type="submit" disabled onClick={onClick}>
          Save
        </PrimaryButton>
      </form>
    );
    const button = screen.getByRole("button", { name: "Save" });
    // Never natively disabled: that drops focus to <body> and takes the button out of Tab's order.
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    // Implicit submission (Enter in a field) is a click on the default button, so this is Enter too.
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("when ready, acts and submits", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PrimaryButton type="submit" onClick={onClick}>
          Save
        </PrimaryButton>
      </form>
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toHaveAttribute("aria-disabled");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("the shared kit (features/mira/ui/kit)", () => {
  it("refuses an under-18 account in one calm sentence, never as an error to retry (decision 9)", () => {
    render(<AdultsOnly />);
    expect(screen.getByText(ADULTS_ONLY)).toHaveTextContent("Mira is only for adults.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("asks before deleting: the safe choice has focus, the question names the group (UX-9)", () => {
    const onConfirm = vi.fn();
    const onKeep = vi.fn();
    const { rerender } = render(
      <ConfirmDelete
        question="Delete this goal and its ticks? This can't be undone."
        onConfirm={onConfirm}
        onKeep={onKeep}
      />
    );
    expect(
      screen.getByRole("group", { name: "Delete this goal and its ticks? This can't be undone." })
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Deleting: the button keeps focus and ignores a second tap; a failure is said aloud.
    rerender(
      <ConfirmDelete
        question="Delete this goal and its ticks? This can't be undone."
        busy
        error="We couldn't delete it. Please try again."
        onConfirm={onConfirm}
        onKeep={onKeep}
      />
    );
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).not.toHaveAttribute("disabled");
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't delete it.");
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("names the destructive button for what it does", () => {
    render(
      <ConfirmDelete
        question="Delete every check-in in your journal? This can't be undone."
        action="Delete my journal"
        onConfirm={() => undefined}
        onKeep={() => undefined}
      />
    );
    expect(screen.getByRole("button", { name: "Delete my journal" })).toBeInTheDocument();
  });

  it("words every card's way to its page the same: See all, then what (UX-10)", () => {
    render(<SectionLink href="/mira/goals" what="goals" />);
    const link = screen.getByRole("link", { name: "See all goals" });
    expect(link).toHaveAttribute("href", "/mira/goals");
    expect(link).toHaveTextContent(/^See all/);
  });

  it("writes dates one way, whatever the browser's language: 22 Nov, the year only when it isn't this one (SET-12)", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    expect(shortDate("2026-11-15T12:00:00Z", now)).toBe("15 Nov");
    expect(shortDate("2025-11-25T12:00:00Z", now)).toBe("25 Nov 2025");
    // Every month three letters, as AP spells them: ICU's en-GB says "Sept" in some builds.
    expect(
      Array.from({ length: 12 }, (_, m) => shortDate(new Date(2026, m, 3, 12).toISOString(), now))
    ).toEqual(
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
        (m) => `3 ${m}`
      )
    );
  });
});

describe("the signed-in frame", () => {
  const frame = (active: Parameters<typeof MiraAppFrame>[0]["active"]) =>
    render(
      <MiraAppFrame active={active}>
        <p>Page</p>
      </MiraAppFrame>
    );
  const menu = () => screen.getByRole("navigation", { name: "Mira" });
  /** Each menu link's address, in order (jsdom has no CSS: a phone and a desktop label both show). */
  const hrefs = () =>
    within(menu())
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));

  it("has a banner with the logo and the menu, the page as main, and the foot outside main (A11Y-15)", () => {
    const { container } = frame("home");
    const header = container.querySelector("header")!;
    expect(header.querySelector('nav[aria-label="Mira"]')).not.toBeNull();
    expect(header.querySelector('a[href="/mira/home"]')).not.toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("Page");
    expect(screen.getByRole("main").querySelector("footer")).toBeNull();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Mira is in beta");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("puts Home, Chat, Journal and Goals on the phone's bar and the rest in More (decision 8)", () => {
    frame("journal");
    expect(hrefs()).toEqual([
      "/mira/home",
      "/mira",
      "/mira/journal",
      "/mira/goals",
      "/mira/assessments",
      "/mira/recordings",
      "/mira/coaches",
      "/mira/guide",
      "/mira/settings",
    ]);
    // One name for the chat on phones and desktop alike (SET-11): never "Coach & chats".
    expect(within(menu()).getByRole("link", { name: /^Chat/ })).toHaveTextContent("Chat with Mira");
    expect(menu()).not.toHaveTextContent("Coach & chats");
    const current = within(menu()).getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/mira/journal"]);
    // The bar's last place opens the rest, as a dialog.
    const more = within(menu()).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("opens More as a sheet with the other pages, the current one marked, and closes it", () => {
    frame("settings");
    fireEvent.click(within(menu()).getByRole("button", { name: /^More/ }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual(["Assessments", "Voice sessions", "Coaches", "Guide", "Settings"]);
    expect(within(sheet).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(within(sheet).getByRole("button", { name: "Need support right now?" })).toBeVisible();
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("closes More on a tap outside the sheet, as people expect of it", () => {
    frame("home");
    fireEvent.click(within(menu()).getByRole("button", { name: "More" }));
    // The dimmed page around the sheet: a tap on the dialog element outside its box.
    fireEvent.click(screen.getByRole("dialog", { name: "More" }), { clientX: 500, clientY: 900 });
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("closes More when one of its pages is chosen", () => {
    frame("home");
    fireEvent.click(within(menu()).getByRole("button", { name: "More" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "More" })).getByRole("link", { name: "Coaches" })
    );
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  // R3-UXA-12: on a page in More the bar marked More only by its pill and weight.
  it("says on the bar which of More's pages is open, and nothing more elsewhere", () => {
    frame("settings");
    expect(within(menu()).getByRole("button", { name: "More, current: Settings" })).toBeVisible();
    cleanup();
    frame("recordings");
    expect(
      within(menu()).getByRole("button", { name: "More, current: Voice sessions" })
    ).toBeVisible();
    cleanup();
    frame("journal");
    expect(within(menu()).getByRole("button", { name: "More" })).toBeVisible();
  });

  it("marks the bar for the page's focus room below it (R3-UXA-1: global CSS keys on data-mira-bar)", () => {
    frame("home");
    expect(menu()).toHaveAttribute("data-mira-bar");
  });

  // R3-UXA-12 item 3: Mira's copy mixed ' and ’; it writes ’.
  it("writes its own words with typographic apostrophes", () => {
    frame("home");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("If you’re struggling");
    expect(screen.getByRole("contentinfo").textContent).not.toContain("'");
  });

  it("marks nothing as current on a page outside the menu", () => {
    frame(undefined);
    expect(within(menu()).queryAllByRole("link", { current: "page" })).toEqual([]);
  });
});

describe("the logo (SET-7)", () => {
  it("leads a signed-in page to Home, and says so", () => {
    render(<Wordmark home />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/mira/home");
    expect(link.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Applied Psychometrics BETA, Mira home"
    );
  });

  it("elsewhere leads to the chat's start, and says that instead of Home", () => {
    render(<Wordmark />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/mira");
    expect(link.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Applied Psychometrics BETA, talk to Mira"
    );
  });
});

describe("the guide's frame (UX-3, SET-6)", () => {
  it("signed in, is the app's frame with Guide marked, so the menu and Home are one tap away", async () => {
    session.account = { id: "u1", email: "robin@example.com" };
    render(await GuideLayout({ children: <p>The guide</p> }));
    const menu = screen.getByRole("navigation", { name: "Mira" });
    expect(within(menu).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/mira/guide"
    );
    expect(screen.getByRole("main")).toHaveTextContent("The guide");
    expect(screen.getByRole("link", { name: /Mira home$/ })).toHaveAttribute("href", "/mira/home");
  });

  it("signed out, is the open pages' frame: the logo and the legal links, no menu", async () => {
    session.account = null;
    render(await GuideLayout({ children: <p>The guide</p> }));
    expect(screen.queryByRole("navigation", { name: "Mira" })).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("The guide");
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
  });
});

describe("Home", () => {
  type Chat = { id: string; title: string; updated_at: string };
  /**
   * GET /api/mira/me answers with each reply in turn; a missing one never answers, nor do the
   * other cards' reads (each card owns its own states, tested with it).
   */
  function account(...replies: Array<{ status: number; chats?: Chat[] }>) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url !== "/api/mira/me") return new Promise<Response>(() => undefined);
      const r = replies.shift();
      if (!r) return new Promise<Response>(() => undefined);
      return {
        ok: r.status < 400,
        status: r.status,
        json: async () =>
          r.status < 400
            ? { profile: { name: "Robin", email: "robin@example.com" }, chats: r.chats ?? [] }
            : { error: "Unable to load your account." },
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const chat = (n: number, updated_at = "2026-11-22T08:00:00Z"): Chat => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    title: `Chat ${n}`,
    updated_at,
  });

  it("greets by name from the first paint, so the heading never changes (UX-15)", async () => {
    account({ status: 200, chats: [chat(1)] });
    render(<MiraHome hour={8} name="Robin" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Good morning, Robin");
    await screen.findByRole("heading", { name: "Continue with Mira" });
    expect(h1).toHaveTextContent("Good morning, Robin");
  });

  it("never shows the new person's card while the chats load; a failure says so and can be tried again (SET-4)", async () => {
    const fetchMock = account({ status: 500 }, { status: 200, chats: [chat(1)] });
    render(<MiraHome hour={8} name="Robin" />);
    expect(screen.queryByRole("heading", { name: "Start with Mira" })).toBeNull();
    expect(screen.getByText("Loading your chats")).toBeInTheDocument();
    expect(await screen.findByText("Your chats didn’t load.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Start with Mira" })).toBeNull();
    expect(screen.getByRole("link", { name: "New chat" })).toHaveAttribute("href", "/mira");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Continue with Mira" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/mira/me")).toHaveLength(2);
  });

  // R3-UXA-7: the button was swapped for the placeholder at once, dropping focus to the page.
  it("keeps focus on Try again while it retries, then on the card's heading once it loads", async () => {
    const meReply = (status: number) =>
      ({
        ok: status < 400,
        status,
        json: async () =>
          status < 400
            ? { profile: { name: "Robin", email: "r@example.com" }, chats: [chat(1)] }
            : { error: "Unable to load your account." },
      }) as Response;
    let answer!: (r: Response) => void;
    const replies = [
      Promise.resolve(meReply(500)),
      Promise.resolve(meReply(500)),
      new Promise<Response>((r) => (answer = r)),
    ];
    const fetchMock = vi.fn((url: string) =>
      url === "/api/mira/me" ? replies.shift()! : new Promise<Response>(() => undefined)
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<MiraHome hour={8} name="Robin" />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    retry.focus();

    // A retry that fails again: the same button, still focused, ready again.
    fireEvent.click(retry);
    expect(document.activeElement).toBe(retry);
    await waitFor(() => expect(retry).not.toHaveAttribute("aria-disabled"));
    expect(document.activeElement).toBe(retry);

    // While a retry runs the button stays, aria-disabled, and a second press waits for it.
    fireEvent.click(retry);
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(retry);
    fireEvent.click(retry);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/mira/me")).toHaveLength(3);

    answer(meReply(200));
    const heading = await screen.findByRole("heading", { name: "Continue with Mira" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("invites a person with no chats to start", async () => {
    account({ status: 200, chats: [] });
    render(<MiraHome hour={8} name="Robin" />);
    expect(await screen.findByRole("heading", { name: "Start with Mira" })).toBeInTheDocument();
  });

  // HAB-16 on Home: the journal and goals cards each said it, so Home said it twice.
  it("says a lost sign-in once, above the cards, when the cards' own reads find it gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = url.split("?")[0];
        if (path === "/api/mira/me") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ profile: { name: "Robin", email: "r@example.com" }, chats: [] }),
          } as Response;
        }
        if (path === "/api/mira/journal" || path === "/api/mira/goals") {
          return { ok: false, status: 401, json: async () => ({ error: "x" }) } as Response;
        }
        return new Promise<Response>(() => undefined); // the other cards: never answered
      })
    );
    render(<MiraHome hour={8} name="Robin" />);
    expect(await screen.findByText("You were signed out.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Daily journal" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Challenges & goals" })).toBeNull();
    expect(screen.getAllByText("You were signed out.")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Sign in again" })).toHaveLength(1);
  });

  // R3-UXA-2: Home went to sign-in on its own, and the sign-in page, still seeing the session, sent
  // the person straight back: round and round, about 50 times in 12 s.
  it("after a 401 never leaves Home on its own: it says so once, with the way back in", async () => {
    // The way back is the page's own address (signInHref), as on every Mira page.
    window.history.replaceState(null, "", "/mira/home");
    account({ status: 401 });
    render(<MiraHome hour={8} name="Robin" />);
    const link = await screen.findByRole("link", { name: "Sign in again" });
    expect(link).toHaveAttribute("href", "/mira/start?next=%2Fmira%2Fhome");
    expect(screen.getAllByText("You were signed out.")).toHaveLength(1);
    // Neither a retry nor a placeholder that waits for ever.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("Loading your chats")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });

  it("opens every chat on any screen, not only the latest four (CHAT-26)", async () => {
    account({ status: 200, chats: [1, 2, 3, 4, 5, 6].map((n) => chat(n)) });
    render(<MiraHome hour={8} name="Robin" />);
    const earlier = await screen.findByRole("list", { name: "Earlier chats" });
    expect(
      within(earlier)
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual([
      expect.stringContaining("Chat 2"),
      expect.stringContaining("Chat 3"),
      expect.stringContaining("Chat 4"),
    ]);
    const more = screen.getByRole("button", { name: "Show more chats" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(within(earlier).getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer chats" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("dates a chat older than a week like the rest of Mira, whatever the browser's language (SET-12)", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T12:00:00Z"), toFake: ["Date"] });
    account({ status: 200, chats: [chat(1), chat(2, "2026-11-01T12:00:00Z")] });
    render(<MiraHome hour={8} name="Robin" />);
    const earlier = await screen.findByRole("list", { name: "Earlier chats" });
    expect(earlier).toHaveTextContent("1 Nov");
  });

  // R3-UXA-8: every card said "Mira is only for adults.", seven times down the page, under a card
  // that still offered "Start with Mira".
  describe("for an account stopped as under 18", () => {
    /** /api/mira/me with `minor`, every habit's read refused as the routes refuse it. */
    function stopped(meMinor: boolean) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.split("?")[0] === "/api/mira/me") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                profile: { name: "Kim", email: "kim@example.com" },
                chats: [],
                minor: meMinor,
              }),
            } as Response;
          }
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: ADULTS_ONLY, minor: true }),
          } as Response;
        })
      );
    }
    const quietPage = () => {
      expect(screen.getAllByText(ADULTS_ONLY)).toHaveLength(1);
      expect(screen.queryByRole("heading", { name: /with Mira$/ })).toBeNull();
      expect(screen.queryByRole("link", { name: "New chat" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Daily journal" })).toBeNull();
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      expect(screen.queryByText(/Wonderful to see you/)).toBeNull();
    };

    it("says it once, from the first paint, and shows nothing it can't use", async () => {
      stopped(true);
      render(<MiraHome minor hour={8} name="Kim" />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good morning, Kim");
      quietPage();
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/mira/me", expect.anything()));
      quietPage();
    });

    it("says it once too when only the account's read finds the stop", async () => {
      stopped(true);
      render(<MiraHome hour={8} name="Kim" />);
      await waitFor(quietPage);
    });

    it("keeps the support lines at hand during the quiet after them", () => {
      stopped(true);
      render(<MiraHome minor quiet hour={8} name="Kim" />);
      expect(screen.getAllByText(ADULTS_ONLY)).toHaveLength(1);
      expect(screen.getByRole("button", { name: "See support lines" })).toBeInTheDocument();
    });
  });

  it("is neutral while the 14 days after the support lines run, with the lines at hand (CHAT-17)", async () => {
    account();
    render(<MiraHome quiet hour={8} name="Kim" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello, Kim");
    expect(screen.queryByText(/Wonderful to see you/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See support lines" }));
    expect(screen.getByRole("dialog", { name: "Support right now" })).toBeInTheDocument();
  });
});

describe("Home's page (server)", () => {
  it("passes the name, the hour in the person's own time zone and the quiet the nudges keep", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T07:30:00Z"), toFake: ["Date"] });
    session.account = { id: "u1", email: "kim@example.com" };
    server.profile = { name: "Kim", time_zone: "Asia/Tokyo", country: "JP" };
    const asked: Array<[string, Date]> = [];
    server.hadCrisis = async (id, since) => {
      asked.push([id, since]);
      return true;
    };
    const el = (await HomePage()) as { props: Record<string, unknown> };
    expect(el.props).toMatchObject({ name: "Kim", hour: 16, quiet: true, minor: false });
    // The same 14 days as the nudges and the journal reminders.
    expect(asked).toEqual([["u1", new Date("2026-11-08T07:30:00Z")]]);
  });

  it("stays neutral when it can't tell, and says Hello when the account can't be read", async () => {
    session.account = { id: "u1", email: "kim@example.com" };
    server.profile = null;
    server.hadCrisis = async () => {
      throw new Error("down");
    };
    const el = (await HomePage()) as { props: Record<string, unknown> };
    expect(el.props).toMatchObject({ name: null, hour: null, quiet: true });
  });

  it("knows before the first paint that the account was stopped as under 18 (R3-UXA-8)", async () => {
    session.account = { id: "u1", email: "kim@example.com" };
    server.profile = { name: "Kim", time_zone: "Europe/Berlin", country: "DE" };
    server.hadCrisis = async () => false;
    const asked: Array<string | null> = [];
    stop.isMinor = async (id) => {
      asked.push(id);
      return true;
    };
    expect(((await HomePage()) as { props: Record<string, unknown> }).props.minor).toBe(true);
    expect(asked).toEqual(["u1"]);
    // Unsure is not stopped (as /api/mira/me answers): the cards then each refuse on their own.
    stop.isMinor = async () => {
      throw new Error("down");
    };
    expect(((await HomePage()) as { props: Record<string, unknown> }).props.minor).toBe(false);
    stop.isMinor = async () => false;
  });

  it("is quiet only after support lines", async () => {
    session.account = { id: "u1", email: "kim@example.com" };
    server.profile = { name: "Kim", time_zone: "Europe/Berlin", country: "DE" };
    server.hadCrisis = async () => false;
    const el = (await HomePage()) as { props: Record<string, unknown> };
    expect(el.props).toMatchObject({ quiet: false });
  });

  it("sends a signed-out visit to sign in, then back to Home", async () => {
    session.account = null;
    await expect(HomePage()).rejects.toThrow("redirect /mira/start?next=%2Fmira%2Fhome");
  });
});

describe("Mira's own not-found page (SET-5)", () => {
  it("catches any other address under /mira", () => {
    expect(() => MissingPage()).toThrow("not found");
  });

  it("signed in, says the page isn't here inside the app's frame, with the way Home", async () => {
    session.account = { id: "u1", email: "robin@example.com" };
    render(await MiraNotFound());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page isn’t here");
    expect(screen.getByRole("navigation", { name: "Mira" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/mira/home");
  });

  // R3-UXA-11: /mira/assessments/Anxiety said "Assessment | LoveIQ", a page that isn't there.
  it("names the tab for what it is, not for the address asked for", async () => {
    expect(notFoundMetadata.title).toBe("Page not found | LoveIQ");
    // Next.js shows not-found.tsx's metadata only when generateMetadata itself throws notFound().
    await expect(checkMetadata({ params: Promise.resolve({ check: "Anxiety" }) })).rejects.toThrow(
      "not found"
    );
    await expect(
      recordingMetadata({ params: Promise.resolve({ id: "not-a-uuid" }) })
    ).rejects.toThrow("not found");
    // Real addresses keep their own titles.
    expect((await checkMetadata({ params: Promise.resolve({ check: "anxiety" }) })).title).toMatch(
      / \| LoveIQ$/
    );
    expect((await checkMetadata({ params: Promise.resolve({ check: "body" }) })).title).toBe(
      "Body check | LoveIQ"
    );
    expect(
      (
        await recordingMetadata({
          params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }),
        })
      ).title
    ).toBe("Voice session | LoveIQ");
  });

  it("signed out, says so in the open frame, with the way to Mira", async () => {
    session.account = null;
    render(await MiraNotFound());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page isn’t here");
    expect(screen.queryByRole("navigation", { name: "Mira" })).toBeNull();
    expect(screen.getByRole("link", { name: "Talk to Mira" })).toHaveAttribute("href", "/mira");
  });
});

describe("Mira's own error page (SET-17)", () => {
  it("on a signed-in page: says what happened, in the frame with the menu, Try again and Home", () => {
    nav.path = "/mira/assessments/anxiety";
    const retry = vi.fn();
    render(<MiraError error={new Error("boom")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page didn’t load");
    const menu = screen.getByRole("navigation", { name: "Mira" });
    expect(within(menu).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/mira/assessments"
    );
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/mira/home");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    // Still reported, as the site's own error page does: Mira's boundary catches it first now.
    expect(posthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ error_boundary: "app/mira/error.tsx" })
    );
  });

  it("reloads the page when its code failed to load (a dropped connection, a new release)", () => {
    nav.path = "/mira/home";
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const retry = vi.fn();
    const chunk = Object.assign(new Error("Failed to load chunk /_next/x.js"), {
      name: "ChunkLoadError",
    });
    render(<MiraError error={chunk} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("on an open page (the chat, the guide, a link from an email): the open frame and the way to Mira", () => {
    nav.path = "/mira";
    render(<MiraError error={new Error("boom")} retry={vi.fn()} />);
    expect(screen.queryByRole("navigation", { name: "Mira" })).toBeNull();
    expect(screen.getByRole("link", { name: "Talk to Mira" })).toHaveAttribute("href", "/mira");
    nav.path = "/mira/journal/reminder";
    cleanup();
    render(<MiraError error={new Error("boom")} retry={vi.fn()} />);
    expect(screen.queryByRole("navigation", { name: "Mira" })).toBeNull();
  });
});

describe("the support lines, from any page (SET-9)", () => {
  const open = (country: string | null) => {
    render(
      <MiraLookRoot initial={DEFAULT_LOOK} country={country}>
        <MiraAppFrame active="journal">
          <p>Page</p>
        </MiraAppFrame>
      </MiraLookRoot>
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Need support right now?" })[0]!);
    return within(screen.getByRole("dialog", { name: "Support right now" }));
  };

  it("list the country saved in Settings first", () => {
    expect(open("DE").getAllByRole("region")[0]).toHaveAccessibleName("Germany");
  });

  it("keep their usual order without one", () => {
    expect(open(null).getAllByRole("region")[0]).toHaveAccessibleName("United States");
  });

  it("take the country from the account once, in Mira's layout, for every page", async () => {
    session.account = { id: "u1", email: "kim@example.com" };
    server.profile = { name: "Kim", time_zone: "Europe/Berlin", country: "DE" };
    const signedIn = (await MiraLayout({ children: null })) as { props: Record<string, unknown> };
    expect(signedIn.props.country).toBe("DE");
    session.account = null;
    const signedOut = (await MiraLayout({ children: null })) as { props: Record<string, unknown> };
    expect(signedOut.props.country).toBeNull();
  });
});
