// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { starterFor } from "@features/mira/content/checks";
import { guideStarter } from "@features/mira/content/coaches";
import { CONSENT_VERSION } from "@features/mira/server/config";
import MiraChat from "@features/mira/ui/MiraChat";

/**
 * A starter from the address (`?ask=N`, `?say=<check>`) is placed in the composer once: the
 * address then loses it, so a reload or Back (which can bring the page back from the router's
 * cache, with the same starter) neither refills the composer nor counts the guide's ask again.
 */

const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body =
    key === "POST /api/mira/chat"
      ? { reply: "Sure, step one…", freeLeft: 7 }
      : key === "GET /api/mira/me"
        ? { profile: { style: {} }, chats: [] }
        : { success: true };
  return { ok: true, status: 200, json: async () => body } as Response;
});
const guideAsks = () =>
  fetchMock.mock.calls
    .filter(([url]) => url === "/api/mira/event")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)
    .filter((e) => e.name === "guide_ask");
const composer = () => (screen.getByLabelText("Message Mira") as HTMLTextAreaElement).value;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("a starter from the address", () => {
  it("the guide's ask: placed once, counted once, gone from the address", async () => {
    window.history.replaceState(null, "", "/mira?ask=3");
    const starter = guideStarter(3)!;
    const first = render(<MiraChat signedIn={false} initialChatId={null} starter={starter} />);
    expect(composer()).toBe(starter);
    expect(window.location.pathname + window.location.search).toBe("/mira");
    expect(guideAsks()).toEqual([{ type: "coaches", name: "guide_ask", detail: "3" }]);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sure, step one…");
    first.unmount();
    // Back: the router's cache brings the page back with the same starter; the address has none.
    render(<MiraChat signedIn={false} initialChatId={null} starter={starter} />);
    await screen.findByText("Sure, step one…");
    expect(composer()).toBe("");
    expect(guideAsks()).toHaveLength(1);
  });

  it("a check's 'Talk to Mira': placed once and gone from the address, not counted as an ask", async () => {
    window.history.replaceState(null, "", "/mira?say=anxiety");
    const starter = starterFor("anxiety")!;
    const first = render(<MiraChat signedIn initialChatId={null} starter={starter} />);
    expect(composer()).toBe(starter);
    expect(window.location.search).toBe("");
    first.unmount();
    render(<MiraChat signedIn initialChatId={null} starter={starter} />);
    expect(composer()).toBe("");
    expect(guideAsks()).toEqual([]);
  });
});
