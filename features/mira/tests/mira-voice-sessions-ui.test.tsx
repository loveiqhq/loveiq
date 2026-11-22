// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
// The session pages' sign-in check: signed out unless a test says otherwise.
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: async () => null }));

import RecordingPage from "@/app/mira/recordings/[id]/page";
import RecordingDetail from "@features/mira/ui/recordings/RecordingDetail";
import RecordingsPage, { RecordingsCard } from "@features/mira/ui/recordings/Recordings";

/** Voice sessions, kept as words: Home's card, the list page and one session's page. */

type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = Object.entries(replies).find(([k]) => key.startsWith(k))?.[1](body) ?? {
    status: 404,
    body: { error: "Not found." },
  };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
/** The sessions' links, in order (noon UTC keeps their dates in any time zone). */
const rows = () => [
  ...document.querySelectorAll<HTMLAnchorElement>('a[href^="/mira/recordings/"]'),
];
const asked = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
/** The under-18 stop's refusal, as every Mira route gives it (decision 9). */
const MINOR = () => ({ status: 403, body: { error: "Mira is only for adults.", minor: true } });
/** Nothing of a failed load: no "didn't load", no Try again, no alert. */
const noRetry = () => {
  expect(screen.queryByText(/didn.t load/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
};

const ID = "1c2d3e4f-3333-4444-8555-a66677778888";
const CHAT = "0b8a7c6d-2222-4333-8444-955566667777";
const SESSIONS = [
  {
    id: ID,
    startedAt: "2026-10-28T12:00:00Z",
    seconds: 900,
    you: 64,
    summary: "Why compliments don't land; you tried a plain thank you.",
    previousAt: "2026-10-26T12:00:00Z",
  },
  {
    id: "2d3e4f50-4444-4555-8666-b77788889999",
    startedAt: "2026-10-26T12:00:00Z",
    seconds: 40,
    you: 58,
    summary: null,
    previousAt: null,
  },
];

beforeEach(() => {
  replies = {};
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("SpeechRecognition", class {}); // a browser that can listen (Chrome, Safari, Edge)
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
});

describe("Start a voice session", () => {
  it("explains that Talk needs Chrome, Safari or Edge where the browser can't listen", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    replies["GET /api/mira/recordings?limit=3"] = () => ({ body: { recordings: [], more: false } });
    render(<RecordingsCard />);
    const card = await screen.findByRole("region", { name: "Voice sessions" });
    await waitFor(() =>
      expect(within(card).getByText(/needs Chrome, Safari or Edge/)).toBeTruthy()
    );
    expect(within(card).queryByRole("link", { name: "Start a voice session" })).toBeNull();
    expect(
      within(card).getByRole("link", { name: "type to her in the chat" }).getAttribute("href")
    ).toBe("/mira");
  });
});

describe("Home's voice sessions card", () => {
  it("shows the latest three as words: their line, length, talk share and the gap between them", async () => {
    replies["GET /api/mira/recordings?limit=3"] = () => ({
      body: { recordings: SESSIONS, more: false },
    });
    render(<RecordingsCard />);
    const card = screen.getByRole("region", { name: "Voice sessions" });
    expect(within(card).getByText("Kept as words, never audio.")).toBeTruthy();
    await waitFor(() => expect(rows()).toHaveLength(2));
    const [latest, first] = rows();
    expect(latest!.getAttribute("href")).toBe(`/mira/recordings/${ID}`);
    expect(within(latest!).getByText(/compliments don't land/)).toBeTruthy();
    expect(within(latest!).getAllByText("15 min").length).toBeGreaterThan(0);
    expect(within(latest!).getAllByText("You 64% · Mira 36%").length).toBeGreaterThan(0);
    expect(within(latest!).getByText("since the last").previousSibling?.textContent).toBe("2 days");
    expect(within(first!).getByText("first session")).toBeTruthy();
    expect(within(first!).getAllByText("<1 min").length).toBeGreaterThan(0);
    // UX-10: every Home card's one "See all →", in its header before the sessions; the way to
    // start one comes after them, no longer squeezed in beside it.
    const seeAll = within(card).getByRole("link", { name: "See all voice sessions" });
    expect(seeAll.getAttribute("href")).toBe("/mira/recordings");
    expect(seeAll.textContent).toBe("See all voice sessions");
    const start = within(card).getByRole("link", { name: "Start a voice session" });
    expect(start.getAttribute("href")).toBe("/mira?talk=1");
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(seeAll, latest!)).toBe(true);
    expect(before(first!, start)).toBe(true);
  });

  it("has a next step when there are none yet", async () => {
    replies["GET /api/mira/recordings?limit=3"] = () => ({ body: { recordings: [], more: false } });
    render(<RecordingsCard />);
    expect(await screen.findByText("No voice sessions yet")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Start a voice session" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /See all/ })).toBeNull();
    // VOI-V8b: kept only with memory on, so the promise says so.
    expect(screen.getByText(/each session waits here as words/).textContent).toBe(
      "Talk to Mira out loud. While “Remember our conversations” is on in Settings, each session waits here as words, with up to three key points. Never as audio."
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/mira/settings"
    );
  });

  // Decision 9: an account Mira stopped as under 18 gets the one calm refusal, never "didn't
  // load" or Try again. Only `minor: true` counts: a CSRF refusal is a 403 too.
  it("says 'Mira is only for adults.' to an account stopped as under 18, here and on the page", async () => {
    replies["GET /api/mira/recordings?limit=3"] = MINOR;
    render(<RecordingsCard />);
    const card = screen.getByRole("region", { name: "Voice sessions" });
    expect(await within(card).findByText("Mira is only for adults.")).toBeTruthy();
    expect(within(card).queryByRole("link")).toBeNull(); // nothing to start or to see
    noRetry();
    cleanup();
    replies["GET /api/mira/recordings?limit=50"] = MINOR;
    render(<RecordingsPage />);
    expect(await screen.findByText("Mira is only for adults.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Start a voice session" })).toBeNull();
    noRetry();
    cleanup();
    // Stopped while the page was open: "Show older sessions" ends the same way.
    replies = {}; // the older page's key first: the fake answers the first key a request starts with
    replies[`GET /api/mira/recordings?limit=50&before=`] = MINOR;
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: SESSIONS, more: true },
    });
    render(<RecordingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Show older sessions" }));
    expect(await screen.findByText("Mira is only for adults.")).toBeTruthy();
    expect(rows()).toHaveLength(0);
    noRetry();
  });

  // Home's one wording for a failed read, never in red (round-3 SET-11, kit/load-failed).
  it("says when they didn't load, and tries again", async () => {
    replies["GET /api/mira/recordings?limit=3"] = () => ({ status: 500, body: {} });
    render(<RecordingsCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your voice sessions didn’t load.");
    expect(document.body.innerHTML).not.toMatch(/text-ap-bad-ink/);
    replies["GET /api/mira/recordings?limit=3"] = () => ({
      body: { recordings: SESSIONS, more: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });
});

describe("the voice sessions page", () => {
  // Round-3 R3-ACCT-9 (SET-12): the date tile's own en-GB month said "Sept" in Chromium and
  // Firefox; it is the kit's, "Sep", as every other date in Mira.
  it("names a September session's month as every Mira date does", async () => {
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: [{ ...SESSIONS[1]!, startedAt: "2026-09-22T12:00:00Z" }], more: false },
    });
    render(<RecordingsPage />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent(/22\s*Sep(?!t)/);
  });

  it("lists every session", async () => {
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: SESSIONS, more: true },
    });
    render(<RecordingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Voice sessions" })).toBeTruthy();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Show older sessions" })).toBeTruthy();
  });

  // Round 3's 401 loop: a move to sign-in of the page's own could bounce back and forth with
  // /mira/start while that page still saw the session. It is said in place, with the way back.
  it("says a lost sign-in in place, with the way back to this page, and never navigates", async () => {
    const signedOutHere = async (path: string) => {
      expect(await screen.findByText("You were signed out.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
        "href",
        `/mira/start?next=${encodeURIComponent(path)}`
      );
      expect(rows()).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /Try again|Show older|Delete/ })).toBeNull();
    };
    window.history.replaceState(null, "", "/mira/recordings");
    replies["GET /api/mira/recordings?limit=50"] = () => ({ status: 401, body: {} });
    render(<RecordingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Voice sessions" })).toBeTruthy();
    await signedOutHere("/mira/recordings");
    cleanup();
    // Gone while the page was open: "Show older sessions" says it the same way.
    replies = {}; // the older page's key first: the fake answers the first key a request starts with
    replies["GET /api/mira/recordings?limit=50&before="] = () => ({ status: 401, body: {} });
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: SESSIONS, more: true },
    });
    render(<RecordingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Show older sessions" }));
    await signedOutHere("/mira/recordings");
    cleanup();
    // Home's card goes quiet: Home says it once, above its cards.
    replies["GET /api/mira/recordings?limit=3"] = () => ({ status: 401, body: {} });
    const card = render(<RecordingsCard />);
    await waitFor(() => expect(card.container).toBeEmptyDOMElement());
    cleanup();
    // One session's page, at its load and when a delete finds the sign-in gone.
    const here = `/mira/recordings/${ID}`;
    window.history.replaceState(null, "", here);
    replies[`GET /api/mira/recordings/${ID}`] = () => ({ status: 401, body: {} });
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Voice session" })).toBeTruthy();
    await signedOutHere(here);
    cleanup();
    replies[`GET /api/mira/recordings/${ID}`] = () => ({
      body: {
        recording: { ...SESSIONS[0]!, chatId: CHAT, keyPoints: [] },
        transcript: [{ role: "user", content: "Compliments never land." }],
      },
    });
    replies[`DELETE /api/mira/recordings/${ID}`] = () => ({ status: 401, body: {} });
    render(<RecordingDetail id={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete this session" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await signedOutHere(here);
    expect(screen.queryByText("Compliments never land.")).toBeNull();

    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });

  // VOI-V9: only the 50 newest could be opened or deleted, though the notice says each can.
  it("reaches every session: Show older sessions adds the ones before the last shown", async () => {
    const OLDER = {
      ...SESSIONS[1]!,
      id: "3e4f5061-5555-4666-8777-c88899990000",
      startedAt: "2026-10-20T12:00:00Z",
    };
    const older = `GET /api/mira/recordings?limit=50&before=${encodeURIComponent(SESSIONS[1]!.startedAt)}`;
    // Set first: the fake answers with the first key a request starts with.
    replies[older] = () => ({ status: 500, body: {} });
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: SESSIONS, more: true },
    });
    render(<RecordingsPage />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    const button = screen.getByRole("button", { name: "Show older sessions" });
    button.focus();
    fireEvent.click(button);
    expect(await screen.findByText("Older sessions didn't load.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show older sessions" })).toHaveFocus();
    replies[older] = () => ({ body: { recordings: [OLDER], more: false } });
    fireEvent.click(screen.getByRole("button", { name: "Show older sessions" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows()[2]!.getAttribute("href")).toBe(`/mira/recordings/${OLDER.id}`);
    expect(screen.queryByText("Older sessions didn't load.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show older sessions" })).toBeNull();
    // Round-3 R3-CHAT-7: the button went with the last page and the focus fell to the page; it
    // goes to the first of the sessions that came, which is read from there.
    expect(rows()[2]).toHaveFocus();
  });
});

describe("one voice session", () => {
  const detail = (keyPoints: string[] | null) => ({
    body: {
      recording: {
        id: ID,
        chatId: CHAT,
        startedAt: SESSIONS[0]!.startedAt,
        seconds: 900,
        you: 64,
        keyPoints,
      },
      transcript: [
        { role: "user", content: "Compliments never land." },
        { role: "assistant", content: "What happens when one does?" },
      ],
    },
  });

  it("shows its key points first, then what was said, and the way back to the chat", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = () =>
      detail(["You notice you brush compliments off.", "You tried a plain thank you."]);
    render(<RecordingDetail id={ID} />);
    const points = within(await screen.findByRole("region", { name: "Key points" }));
    expect(points.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1You notice you brush compliments off.",
      "2You tried a plain thank you.",
    ]);
    expect(screen.getByText("You said:")).toBeTruthy();
    expect(screen.getByText("Compliments never land.")).toBeTruthy();
    expect(screen.getByText("Mira kept the words of this session, never the audio.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue in the chat" }).getAttribute("href")).toBe(
      `/mira?chat=${CHAT}`
    );
  });

  it("asks Mira again for key points she couldn't write at the end", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = () => detail(null);
    replies[`POST /api/mira/recordings/${ID}`] = () => ({
      body: { keyPoints: ["You tried a plain thank you."] },
    });
    render(<RecordingDetail id={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Write them now" }));
    expect(await screen.findByText("You tried a plain thank you.")).toBeTruthy();
  });

  it("deletes it only after a second, plain confirmation, and says what went", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = () => detail([]);
    replies[`DELETE /api/mira/recordings/${ID}`] = () => ({
      status: 500,
      body: { error: "Unable to delete right now. Please try again." },
    });
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByText(/None for this session/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete this session" }));
    expect(asked().filter((a) => a.startsWith("DELETE"))).toEqual([]);
    const ask = screen.getByRole("group", {
      name: /^Delete this session\? Its key points and its words go, here and in the chat/,
    });
    fireEvent.click(within(ask).getByRole("button", { name: "Delete" }));
    // A delete that didn't go through is said inside the question, which stays to try again.
    expect(await within(ask).findByRole("alert")).toHaveTextContent("Unable to delete right now");
    replies[`DELETE /api/mira/recordings/${ID}`] = () => ({ body: { success: true } });
    fireEvent.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Session deleted" })).toBeTruthy();
    expect(asked().filter((a) => a === `DELETE /api/mira/recordings/${ID}`)).toHaveLength(2);
  });

  // UX-9: one way to ask before a delete on every page (the kit's ConfirmDelete).
  it("asks like the journal and goals: the red Delete, then Keep it, which has the focus", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = () => detail([]);
    render(<RecordingDetail id={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete this session" }));
    const ask = screen.getByRole("group", { name: /^Delete this session\?/ });
    expect(
      within(ask)
        .getAllByRole("button")
        .map((b) => b.textContent)
    ).toEqual(["Delete", "Keep it"]);
    expect(within(ask).getByRole("button", { name: "Delete" })).toHaveClass("bg-ap-bad");
    expect(within(ask).getByRole("button", { name: "Keep it" })).toHaveFocus();
    // Keep it puts the focus back where it was, never on the page itself.
    fireEvent.click(within(ask).getByRole("button", { name: "Keep it" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete this session" })).toHaveFocus()
    );
    expect(asked().filter((a) => a.startsWith("DELETE"))).toEqual([]);
  });

  it("says 'Mira is only for adults.' to an account stopped as under 18, also once it was open", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = MINOR;
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByText("Mira is only for adults.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Voice session" })).toBeTruthy();
    noRetry();
    cleanup();
    // Stopped while the page was open: a refused delete or key points end the same way.
    for (const method of ["DELETE", "POST"] as const) {
      replies[`GET /api/mira/recordings/${ID}`] = () => detail(method === "POST" ? null : []);
      replies[`${method} /api/mira/recordings/${ID}`] = MINOR;
      render(<RecordingDetail id={ID} />);
      if (method === "DELETE") {
        fireEvent.click(await screen.findByRole("button", { name: "Delete this session" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      } else {
        fireEvent.click(await screen.findByRole("button", { name: "Write them now" }));
      }
      expect(await screen.findByText("Mira is only for adults."), method).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Key points" })).toBeNull();
      noRetry();
      cleanup();
    }
  });

  it("still says another refusal (a 403 without `minor`) as an error to try again", async () => {
    replies[`GET /api/mira/recordings/${ID}`] = () => detail([]);
    replies[`DELETE /api/mira/recordings/${ID}`] = () => ({
      status: 403,
      body: { error: "Invalid request." },
    });
    render(<RecordingDetail id={ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete this session" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid request.");
    expect(screen.queryByText("Mira is only for adults.")).toBeNull();
  });

  it("sends a signed-out visit to sign in, then back to this session, not the list", async () => {
    await expect(RecordingPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
      `redirect /mira/start?next=${encodeURIComponent(`/mira/recordings/${ID}`)}`
    );
    // An address that can't be a session is no page, signed in or not.
    await expect(RecordingPage({ params: Promise.resolve({ id: "x/../y" }) })).rejects.toThrow(
      "not found"
    );
  });

  it("says when it isn't there, with the way back", async () => {
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByRole("heading", { name: "This session isn't here" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Your voice sessions" }).getAttribute("href")).toBe(
      "/mira/recordings"
    );
  });
});
