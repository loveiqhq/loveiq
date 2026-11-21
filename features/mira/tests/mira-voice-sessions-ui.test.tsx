// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  Object.values(router).forEach((f) => f.mockClear());
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
    expect(within(card).getByRole("link", { name: "See all" }).getAttribute("href")).toBe(
      "/mira/recordings"
    );
    expect(
      within(card).getByRole("link", { name: "Start a voice session" }).getAttribute("href")
    ).toBe("/mira?talk=1");
  });

  it("has a next step when there are none yet", async () => {
    replies["GET /api/mira/recordings?limit=3"] = () => ({ body: { recordings: [], more: false } });
    render(<RecordingsCard />);
    expect(await screen.findByText("No voice sessions yet")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Start a voice session" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
  });

  it("says when they didn't load, and tries again", async () => {
    replies["GET /api/mira/recordings?limit=3"] = () => ({ status: 500, body: {} });
    render(<RecordingsCard />);
    expect(await screen.findByText("Your voice sessions didn't load.")).toBeTruthy();
    replies["GET /api/mira/recordings?limit=3"] = () => ({
      body: { recordings: SESSIONS, more: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });
});

describe("the voice sessions page", () => {
  it("lists every session, and sends a signed-out visitor to sign in", async () => {
    replies["GET /api/mira/recordings?limit=50"] = () => ({
      body: { recordings: SESSIONS, more: true },
    });
    render(<RecordingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Voice sessions" })).toBeTruthy();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByText("Showing your 50 latest sessions.")).toBeTruthy();
    cleanup();
    replies["GET /api/mira/recordings?limit=50"] = () => ({ status: 401, body: {} });
    render(<RecordingsPage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mira/start"));
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
    replies[`DELETE /api/mira/recordings/${ID}`] = () => ({ body: { success: true } });
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByText(/None for this session/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete this session" }));
    expect(asked().filter((a) => a.startsWith("DELETE"))).toEqual([]);
    expect(screen.getByText(/Its key points and its words go, here and in the chat/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Session deleted" })).toBeTruthy();
    expect(asked()).toContain(`DELETE /api/mira/recordings/${ID}`);
  });

  it("says when it isn't there, with the way back", async () => {
    render(<RecordingDetail id={ID} />);
    expect(await screen.findByRole("heading", { name: "This session isn't here" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Your voice sessions" }).getAttribute("href")).toBe(
      "/mira/recordings"
    );
  });
});
