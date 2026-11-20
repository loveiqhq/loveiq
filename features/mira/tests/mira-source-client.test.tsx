// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { SOURCE_COOKIE, SOURCE_HEADER } from "@features/mira/server/config";
import { miraApi, rememberSourceForGoogle } from "@features/mira/ui/api";
import SignUpFlow from "@features/mira/ui/SignUpFlow";
import { GLOBAL_UTM_KEY } from "@shared/url/utm";

const fetchMock = vi.fn(
  async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response
);
/** What the last Mira call said about where the visit came from. */
const lastSource = () => {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  const value = (init?.headers as Record<string, string>)[SOURCE_HEADER]!;
  return JSON.parse(decodeURIComponent(value)) as Record<string, string>;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  window.history.replaceState({}, "", "/mira");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockClear();
});

describe("where a Mira visit came from, sent with every call", () => {
  it("sends a tagged visit's source, medium and campaign, not its referrer or click id", async () => {
    localStorage.setItem(
      GLOBAL_UTM_KEY,
      JSON.stringify({
        utm_source: "instagram",
        utm_medium: "paid_social",
        utm_campaign: "mira_launch",
        referrer_host: "l.instagram.com",
        fbclid: "abc",
      })
    );
    await miraApi("/api/mira/event", { body: { type: "track", name: "chat_opened" } });
    expect(lastSource()).toEqual({
      source: "instagram",
      medium: "paid_social",
      campaign: "mira_launch",
    });
  });

  it("sends the referring site of an untagged visit, and nothing for a direct one", async () => {
    localStorage.setItem(GLOBAL_UTM_KEY, JSON.stringify({ referrer_host: "chatgpt.com" }));
    await miraApi("/api/mira/me");
    expect(lastSource()).toEqual({ referrer_host: "chatgpt.com" });
    localStorage.clear();
    await miraApi("/api/mira/me");
    expect(lastSource()).toEqual({});
  });

  it("reads this page's own tags even before the site-wide capture has run", async () => {
    window.history.replaceState({}, "", "/mira?utm_source=newsletter&utm_campaign=nov");
    await miraApi("/api/mira/event", { body: { type: "track", name: "chat_opened" } });
    expect(lastSource()).toEqual({ source: "newsletter", campaign: "nov" });
  });
});

describe("Google sign-in", () => {
  it("leaves the source in a cookie for the Google routes only, for 10 minutes", () => {
    localStorage.setItem(GLOBAL_UTM_KEY, JSON.stringify({ utm_source: "tiktok" }));
    const set = vi.spyOn(document, "cookie", "set");
    rememberSourceForGoogle();
    expect(set).toHaveBeenCalledWith(
      `${SOURCE_COOKIE}=${encodeURIComponent('{"source":"tiktok"}')}; Path=/api/mira/auth/google; Max-Age=600; SameSite=Lax`
    );
  });

  it("does so when “Continue with Google” is clicked", () => {
    localStorage.setItem(GLOBAL_UTM_KEY, JSON.stringify({ utm_source: "tiktok" }));
    const set = vi.spyOn(document, "cookie", "set");
    render(<SignUpFlow googleEnabled />);
    fireEvent.click(screen.getByText("Continue with Google"));
    expect(
      set.mock.calls.map(([c]) => String(c)).some((c) => c.startsWith(`${SOURCE_COOKIE}=`))
    ).toBe(true);
  });
});
