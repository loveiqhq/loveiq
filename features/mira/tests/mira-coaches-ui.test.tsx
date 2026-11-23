// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));

import MiraPage from "@/app/mira/page";
import MiraGuidePage from "@/app/mira/guide/page";
import { GUIDE_PRACTICES, SKIP_IT } from "@features/mira/content/guide";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";
import CoachRoster from "@features/mira/ui/coaches/CoachRoster";
import CoachesCard from "@features/mira/ui/coaches/CoachesCard";
import HomeSearch from "@features/mira/ui/coaches/HomeSearch";
import PicksCard from "@features/mira/ui/coaches/PicksCard";

/** The coaches' screens (22 Nov 2026); the routes and the picks' logic are tested on their own. */

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = replies[key]?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const events = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => url === "/api/mira/event" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
const coachEvents = () =>
  events()
    .filter((b) => b.type === "coaches")
    .map((b) => (b.detail === undefined ? b.name : `${b.name}:${b.detail}`));

const ME = {
  name: "Lea",
  email: "lea@example.com",
  remember: true,
  topics: [] as string[],
  notified: [] as string[],
  chats: [
    { id: "c1", title: "Why do compliments feel fake?", updated_at: "2026-11-21T10:00:00Z" },
    { id: "c2", title: "Lights off again", updated_at: "2026-11-20T10:00:00Z" },
  ],
};
const serve = (over: Partial<typeof ME> = {}, status = 200) => {
  replies["GET /api/mira/coaches"] = () => ({ status, body: { ...ME, ...over } });
};

beforeEach(() => {
  replies = {};
  serve();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
  window.history.replaceState(null, "", "/");
});

describe("The roster (/mira/coaches)", () => {
  it("introduces Mira, live, and five coming-soon coaches who never open a chat", async () => {
    render(<CoachRoster />);
    const mira = screen.getByRole("article", { name: "Mira" });
    expect(within(mira).getByRole("link", { name: "Talk to Mira" })).toHaveAttribute(
      "href",
      "/mira"
    );
    expect(screen.getAllByText(/Trained on/)).toHaveLength(1);
    expect(within(mira).getByText(/Trained on/).textContent).toBe(
      "Trained on 100+ scientific papers & 100M+ words of research on body confidence"
    );
    for (const name of ["Jonas", "Elif", "Ana", "Theo", "Lena"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: `Talk to ${name}` })).toBeNull();
      expect(screen.getByRole("button", { name: `Notify me when ${name} is ready` })).toBeEnabled();
    }
    await waitFor(() => expect(coachEvents()).toEqual(["coaches_viewed"]));
  });

  it("narrows by the person's words and by area, and offers the finder when nothing fits", async () => {
    render(<CoachRoster />);
    const search = screen.getByRole("searchbox", { name: "Search coaches" });
    fireEvent.change(search, { target: { value: "orgasm" } });
    expect(screen.getByRole("heading", { name: "Lena" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Mira" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Jonas" })).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    const desire = screen.getByRole("button", { name: "Desire" });
    fireEvent.click(desire);
    expect(desire).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Jonas",
      "Elif",
    ]);

    fireEvent.change(search, { target: { value: "quantum physics" } });
    expect(screen.getByRole("heading", { name: "No coach for that yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("button", { name: "All areas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("counts a search that finds nothing once it has settled, never with its words", async () => {
    vi.useFakeTimers();
    render(<CoachRoster />);
    const search = screen.getByRole("searchbox", { name: "Search coaches" });
    for (const v of ["q", "qu", "quantum"]) fireEvent.change(search, { target: { value: v } });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(coachEvents()).toEqual(["coaches_viewed", "search_empty:roster"]);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("quantum");
  });

  it("asks to be told when a coach is ready, and says so; a failure undoes it", async () => {
    replies["POST /api/mira/event"] = (b) =>
      b.coach === "lena"
        ? { status: 500, body: { error: "That didn't go through." } }
        : { body: {} };
    serve({ notified: ["jonas"] });
    render(<CoachRoster />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Jonas is ready/ })).toHaveTextContent(
        "We’ll let you know"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify me when Theo is ready" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Theo is ready/ })).toHaveTextContent(
        "We’ll let you know"
      )
    );
    expect(events()).toContainEqual({ type: "notify", coach: "theo" });

    fireEvent.click(screen.getByRole("button", { name: "Notify me when Lena is ready" }));
    expect(await screen.findByText("That didn't go through.")).toBeInTheDocument();
    // Only a lost sign-in offers to sign in again (R3-ACCT-3).
    expect(screen.queryByRole("link", { name: "Sign in again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Notify me when Lena is ready" })).toHaveTextContent(
      "Notify me"
    );
  });

  // Round-3 R3-ACCT-3: after a lost sign-in, "Notify me" said "You were signed out. Please sign in
  // again." with nothing to tap.
  it("offers Sign in again when Notify me finds the sign-in gone", async () => {
    window.history.replaceState(null, "", "/mira/coaches");
    replies["POST /api/mira/event"] = () => ({ status: 401, body: { error: "Please sign in." } });
    render(<CoachRoster />);
    fireEvent.click(await screen.findByRole("button", { name: "Notify me when Theo is ready" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You were signed out.");
    expect(within(alert).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      `/mira/start?next=${encodeURIComponent("/mira/coaches")}`
    );
    window.history.replaceState(null, "", "/");
  });

  it("lets a Notify me be taken back, keeping the keyboard on the coach's button", async () => {
    serve({ notified: ["jonas"] });
    render(<CoachRoster />);
    const stop = await screen.findByRole("button", { name: "Stop notifying me about Jonas" });
    fireEvent.click(stop);
    const ask = screen.getByRole("button", { name: "Notify me when Jonas is ready" });
    expect(ask).toHaveTextContent("Notify me");
    expect(ask).toHaveFocus();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url)
      ).toEqual(["/api/mira/coaches?notify=jonas"])
    );
    expect(await screen.findByText(/We won’t contact you about Jonas/)).toBeInTheDocument();

    // A failed stop puts the request back and says why.
    replies["DELETE /api/mira/coaches"] = () => ({ status: 500, body: { error: "Not now." } });
    fireEvent.click(ask);
    fireEvent.click(await screen.findByRole("button", { name: "Stop notifying me about Jonas" }));
    expect(await screen.findByText("Not now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jonas is ready/ })).toHaveTextContent(
      "We’ll let you know"
    );
  });

  // R3-HAB-11: at 320 px with Large text the dot ended one line and "Stop" began the next. The
  // row no longer wraps: the dot and Stop are one unit beside the label, which wraps on its own.
  it("keeps Stop beside 'We’ll let you know', its dot with it, on a row that never splits them", async () => {
    serve({ notified: ["jonas"] });
    render(<CoachRoster />);
    const stop = await screen.findByRole("button", { name: "Stop notifying me about Jonas" });
    const unit = stop.parentElement!;
    expect(unit.textContent).toBe("·Stop");
    expect(unit).toHaveClass("shrink-0", "whitespace-nowrap");
    const row = unit.parentElement!;
    const label = within(row).getByRole("button", {
      name: "We’ll let you know when Jonas is ready",
    });
    expect(row).not.toHaveClass("flex-wrap");
    expect(label).toHaveClass("min-w-0", "text-left");
  });

  // R3-HAB-6: on a slow network a Stop sent beside its Notify landed first and kept the request.
  it("sends a Stop only once its Notify has landed, and says Stopped only after the server", async () => {
    let release = () => undefined as void;
    let held = Promise.resolve();
    const hold = () => (held = new Promise<void>((done) => (release = done)));
    const usual = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (url === "/api/mira/event" && String(init.body).includes('"notify"')) await held;
      return usual(url, init);
    });
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    try {
      render(<CoachRoster />);
      hold();
      fireEvent.click(await screen.findByRole("button", { name: "Notify me when Theo is ready" }));
      fireEvent.click(screen.getByRole("button", { name: "Stop notifying me about Theo" }));
      expect(screen.getByRole("button", { name: /Theo is ready/ })).toHaveTextContent("Notify me");
      await act(() => new Promise((r) => setTimeout(r, 30)));
      // The Notify is still on its way: nothing taken back yet, and nothing said.
      expect(deletes()).toEqual([]);
      expect(screen.queryByText(/We won’t contact you about Theo/)).toBeNull();
      release();
      expect(await screen.findByText("Stopped. We won’t contact you about Theo.")).toBeTruthy();
      expect(deletes().map(([url]) => url)).toEqual(["/api/mira/coaches?notify=theo"]);
      expect(screen.getByRole("button", { name: /Theo is ready/ })).toHaveTextContent("Notify me");

      // A Notify that fails after its Stop was pressed is old news: the Stop's outcome is said.
      replies["POST /api/mira/event"] = (b) =>
        b.type === "notify"
          ? { status: 500, body: { error: "That didn't go through." } }
          : { body: {} };
      hold();
      fireEvent.click(screen.getByRole("button", { name: "Notify me when Lena is ready" }));
      fireEvent.click(screen.getByRole("button", { name: "Stop notifying me about Lena" }));
      release();
      expect(await screen.findByText("Stopped. We won’t contact you about Lena.")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: /Lena is ready/ })).toHaveTextContent("Notify me");
    } finally {
      fetchMock.mockImplementation(usual);
    }
  });

  // R4-HABITS-4: a Stop waiting for its slow Notify was lost when the page reloaded or closed
  // first, and the request stayed stored.
  it("sends a waiting Stop as the page goes, kept alive past it, and never twice", async () => {
    let release = () => undefined as void;
    const held = new Promise<void>((done) => (release = done));
    const usual = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
      if (url === "/api/mira/event" && String(init.body).includes('"notify"')) await held;
      return usual(url, init);
    });
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    try {
      render(<CoachRoster />);
      fireEvent.click(await screen.findByRole("button", { name: "Notify me when Elif is ready" }));
      fireEvent.click(screen.getByRole("button", { name: "Stop notifying me about Elif" }));
      await act(() => new Promise((r) => setTimeout(r, 30)));
      expect(deletes()).toEqual([]);
      // A reload or a closed tab: the Stop goes now, as a request that outlives the page.
      window.dispatchEvent(new Event("pagehide"));
      expect(deletes().map(([url, init]) => [url, init?.keepalive])).toEqual([
        ["/api/mira/coaches?notify=elif", true],
      ]);
      // Back from the back/forward cache: the Notify answers, and the Stop isn't sent again.
      release();
      expect(await screen.findByText("Stopped. We won’t contact you about Elif.")).toBeTruthy();
      expect(deletes()).toHaveLength(1);
    } finally {
      fetchMock.mockImplementation(usual);
    }
  });

  it("finds a challenge in two taps and is honest that the coach isn't here yet", async () => {
    render(<CoachRoster />);
    fireEvent.click(screen.getByRole("button", { name: "Not sure? Find my challenge" }));
    const finder = screen.getByRole("region", { name: "Find my challenge" });
    fireEvent.click(within(finder).getByRole("button", { name: "How much I want sex" }));
    expect(within(finder).getByText("Which sounds closer?")).toHaveFocus();
    fireEvent.click(
      within(finder).getByRole("button", { name: "One of us wants sex more than the other" })
    );
    const result = within(finder).getByRole("heading", { name: "Elif is your coach for this" });
    expect(result).toHaveFocus();
    expect(finder).toHaveTextContent("Elif isn’t here yet.");
    expect(within(finder).getByRole("link", { name: "Talk to Mira meanwhile" })).toHaveAttribute(
      "href",
      "/mira"
    );
    within(finder).getByRole("button", { name: "Notify me when Elif is ready" });
    await waitFor(() =>
      expect(coachEvents()).toEqual(["coaches_viewed", "finder_started", "finder_done:elif"])
    );
  });

  it("answers someone Mira stopped as under 18 on Home's cards with the one refusal", async () => {
    replies["GET /api/mira/coaches"] = () => ({ status: 403, body: { error: "x", minor: true } });
    render(<CoachesCard />);
    expect(await screen.findByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Talk to Mira" })).toBeNull();
  });

  // HAB-16, and round 3's 401 loop: said in place with the way back, never a move of its own (the
  // sign-in page may still see the session and send the person straight back).
  it("says a lost sign-in in place, with the way back to the roster, and never navigates", async () => {
    window.history.replaceState(null, "", "/mira/coaches#finder");
    serve({}, 401);
    render(<CoachRoster />);
    expect(await screen.findByText("You were signed out.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/mira/start?next=%2Fmira%2Fcoaches%23finder"
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("offers no coach to someone Mira stopped as under 18", async () => {
    replies["GET /api/mira/coaches"] = () => ({ status: 403, body: { error: "x", minor: true } });
    render(<CoachRoster />);
    expect(await screen.findByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Notify me/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Talk to Mira" })).toBeNull();
  });

  it("opens the finder from a link, and leads somewhere useful when no coach fits", async () => {
    window.history.replaceState(null, "", "/mira/coaches#finder");
    render(<CoachRoster />);
    const finder = await screen.findByRole("region", { name: "Find my challenge" });
    fireEvent.click(within(finder).getByRole("button", { name: "Something else" }));
    expect(within(finder).getByRole("link", { name: "Tell us what would help" })).toHaveAttribute(
      "href",
      "/mira/feedback"
    );
    await waitFor(() => expect(coachEvents()).toContain("finder_done:none"));
  });
});

describe("Picked for you (Home)", () => {
  it("picks practices from the person's chat topics, with a reason, and counts what it shows", async () => {
    serve({ topics: ["hiding", "causes"] });
    render(<PicksCard />);
    const links = await screen.findAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/mira/guide#practice-3",
      "/mira/guide#practice-1",
      "/mira/coaches#coach-ana",
    ]);
    expect(links[0]).toHaveTextContent("Because you talked about hiding your body during intimacy");
    // picks_shown is logged by an effect after the picks render: wait for it before the click,
    // or a busy machine logs the click first.
    await waitFor(() => expect(coachEvents()).toEqual(["picks_shown:chats"]));
    fireEvent.click(links[2]!);
    await waitFor(() =>
      expect(coachEvents()).toEqual(["picks_shown:chats", "pick_clicked:coach-ana"])
    );
  });

  it("starts with the guide's first practice, and says why picks follow memory", async () => {
    serve({ remember: false });
    render(<PicksCard />);
    const link = await screen.findByRole("link", { name: /Notice the watcher/ });
    expect(link).toHaveAttribute("href", "/mira/guide#practice-1");
    expect(screen.getByText(/Remember our conversations/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/mira/settings"
    );
    await waitFor(() => expect(coachEvents()).toEqual(["picks_shown:start"]));
  });

  it("offers a way out when the picks can't load", async () => {
    serve({}, 500);
    render(<PicksCard />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    serve({ topics: ["clothes"] });
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: /Notice the watcher/ })).toBeInTheDocument();
  });
});

describe("Your coaches (Home)", () => {
  it("shows Mira with the last chat, and two coming-soon coaches, honestly", async () => {
    serve({ notified: ["lena"] });
    render(<CoachesCard />);
    const mira = screen.getByRole("article", { name: "Mira" });
    expect(within(mira).getByRole("link", { name: "Talk to Mira" })).toHaveAttribute(
      "href",
      "/mira"
    );
    expect(
      await within(mira).findByRole("link", { name: /Continue “Why do compliments feel fake\?”/ })
    ).toHaveAttribute("href", "/mira?chat=c1");
    const suggested = await screen.findAllByRole("listitem");
    expect(suggested.map((li) => li.textContent)).toEqual([
      expect.stringContaining("You asked to hear when Lena is here"),
      expect.stringContaining("Jonas"),
    ]);
    expect(suggested[0]).toHaveTextContent("Coming soon");
    expect(screen.getByRole("link", { name: "See all coaches" })).toHaveAttribute(
      "href",
      "/mira/coaches"
    );
  });
});

describe("Home search", () => {
  it("finds coaches, practices and the person's own chats as they type, by keyboard too", async () => {
    render(<HomeSearch />);
    const box = screen.getByRole("combobox", { name: "Search coaches, the guide and your chats" });
    fireEvent.change(box, { target: { value: "lights" } });
    // Mira at once; the person's own chat once their titles are in.
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Mira"),
      expect.stringContaining("Lights off again"),
    ]);
    expect(box).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box).toHaveAttribute("aria-activedescendant", options[1]!.id);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/mira?chat=c2");

    fireEvent.change(box, { target: { value: "practice 6" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(router.push).toHaveBeenLastCalledWith("/mira/guide#practice-6");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("isn't there for someone Mira stopped as under 18, like the coaches", async () => {
    replies["GET /api/mira/coaches"] = () => ({ status: 403, body: { error: "x", minor: true } });
    render(<HomeSearch />);
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("says when nothing is found, offers the finder, and counts it without the words", async () => {
    vi.useFakeTimers();
    render(<HomeSearch />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "quantum" } });
    expect(screen.getByText(/Nothing found\. Try other words/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find my challenge" })).toHaveAttribute(
      "href",
      "/mira/coaches#finder"
    );
    await act(async () => vi.advanceTimersByTime(2000));
    expect(coachEvents()).toEqual(["search_empty:home"]);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("quantum");
  });
});

describe("The guide with Mira inside", () => {
  const dom = (el: ReactElement) =>
    new DOMParser().parseFromString(renderToString(el), "text/html");

  it("follows every practice with “Ask Mira about this”, which names it, after its last line", () => {
    const page = dom(<MiraGuidePage />);
    const asks = [...page.querySelectorAll("a")].filter((a) =>
      a.textContent?.startsWith("Ask Mira about this")
    );
    expect(asks.map((a) => a.getAttribute("href"))).toEqual(
      GUIDE_PRACTICES.map((p) => `/mira?ask=${p.number}`)
    );
    for (const p of GUIDE_PRACTICES) {
      const section = page.getElementById(`practice-${p.number}`)!;
      expect(section.textContent?.trim().endsWith(SKIP_IT)).toBe(true);
      const ask = section.nextElementSibling?.querySelector("a");
      expect(ask?.textContent).toBe(`Ask Mira about this: practice ${p.number}, ${p.name}`);
    }
  });

  it("opens the chat with the practice's starter in the composer, sent only by the person", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    const chat = (await MiraPage({ searchParams: Promise.resolve({ ask: "4" }) })) as ReactElement<{
      starter?: string | null;
    }>;
    expect(chat.props.starter).toBe(
      "Can you help me with practice 4 from the guide, “Kindness for body worry”?"
    );
    for (const ask of ["9", "4; drop", "<b>"]) {
      const other = (await MiraPage({ searchParams: Promise.resolve({ ask }) })) as ReactElement<{
        starter?: string | null;
      }>;
      expect(other.props.starter ?? null).toBeNull();
    }

    replies["GET /api/mira/me"] = () => ({ body: { profile: { style: {} }, chats: [] } });
    window.history.replaceState(null, "", "/mira?ask=4"); // the address that asked for it
    render(<MiraChat signedIn initialChatId={null} starter={chat.props.starter} />);
    expect(screen.getByLabelText("Message Mira")).toHaveValue(
      "Can you help me with practice 4 from the guide, “Kindness for body worry”?"
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/mira/chat")).toBe(false);
  });
});
