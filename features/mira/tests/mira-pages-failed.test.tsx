// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mira/home",
}));

import MiraHome from "@features/mira/ui/MiraHome";
import MiraSettings from "@features/mira/ui/MiraSettings";
import AssessmentsPage from "@features/mira/ui/checks/AssessmentsPage";
import CheckPage, { BodyCheckPage } from "@features/mira/ui/checks/CheckPage";
import ChecksSettings from "@features/mira/ui/checks/ChecksSettings";
import GoalsPage from "@features/mira/ui/goals/GoalsPage";
import JournalPage from "@features/mira/ui/journal/JournalPage";
import { JournalSettings } from "@features/mira/ui/journal/JournalSettings";
import RecordingDetail from "@features/mira/ui/recordings/RecordingDetail";
import { WeeklySessionSettings } from "@features/mira/ui/weekly-session/WeeklySessionSettings";

/**
 * Round 4 (habits and core audits, R4-CORE-4): Home's cards said a failed read one way, but the
 * pages sharing their hooks printed the route's own words ("Unable to load your goals.", "No
 * connection…", "Your journal didn’t load just now."), some in red, and their Try again dropped
 * the keyboard's focus to the page. Every one now uses the kit's LoadFailed, as Home does.
 */

const ID = "00000000-0000-4000-8000-000000000001";

/** Each screen: how it mounts, what it says, and the heading that has the focus once it loads. */
const SCREENS: Array<[name: string, mount: () => ReactElement, said: string, loaded: RegExp]> = [
  ["the goals page", () => <GoalsPage />, "Your goals didn’t load.", /^Challenges & goals$/],
  ["the journal page", () => <JournalPage />, "Your journal didn’t load.", /^Daily journal$/],
  [
    "the journal's settings",
    () => <JournalSettings />,
    "Your journal settings didn’t load.",
    /^Daily journal$/,
  ],
  ["Assessments", () => <AssessmentsPage />, "Your assessments didn’t load.", /^Assessments$/],
  [
    "a check's page",
    () => <CheckPage checkId="anxiety" practice={null} />,
    "Your anxiety check didn’t load.",
    /^Anxiety check$/,
  ],
  ["the body check", () => <BodyCheckPage />, "Your body check didn’t load.", /^Body check$/],
  [
    "Settings' assessments",
    () => <ChecksSettings />,
    "Your assessments didn’t load.",
    /^Assessments$/,
  ],
  [
    "Settings' weekly session",
    () => <WeeklySessionSettings />,
    "Your weekly session didn’t load.",
    /^Weekly session$/,
  ],
  [
    "a voice session",
    () => <RecordingDetail id={ID} />,
    "Your voice session didn’t load.",
    /November/,
  ],
  ["Settings", () => <MiraSettings />, "Your settings didn’t load.", /^Settings$/],
  [
    "Home's chats",
    () => <MiraHome hour={8} name="Robin" />,
    "Your chats didn’t load.",
    /^Continue with Mira$/,
  ],
];

const CHECKS = {
  account: "u1",
  email: "a@b.co",
  name: null,
  useChecks: false,
  useAssessment: false,
  support: "DE",
  checks: ["anxiety", "mood", "loneliness"].map((id) => ({ id, results: [], nextAt: null })),
  bodyCheck: { taken: [], due: "baseline", nextAt: null },
  assessment: null,
};
const PROFILE = {
  email: "a@b.co",
  name: "Robin",
  country: "DE",
  gender: null,
  style: {},
  remember_chats: true,
  use_assessment: false,
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  reply_language: null,
};
/** What each read answers once it loads. */
const LOADED: Array<[url: string, body: unknown]> = [
  ["/api/mira/goals", { goals: [] }],
  [
    "/api/mira/journal",
    { entries: [], settings: { share: "off", reminderTime: null, timeZone: "Europe/Berlin" } },
  ],
  ["/api/mira/weekly-session", { slot: null, timeZone: "Europe/Berlin" }],
  ["/api/mira/checks", CHECKS],
  [
    `/api/mira/recordings/${ID}`,
    {
      recording: {
        id: ID,
        chatId: ID,
        startedAt: "2026-11-22T09:00:00Z",
        seconds: 600,
        you: 50,
        keyPoints: [],
      },
      transcript: [],
    },
  ],
  ["/api/mira/recordings", { recordings: [], more: false }],
  ["/api/mira/me", { profile: PROFILE, chats: [{ id: ID, title: "A chat", updated_at: "" }] }],
  [
    "/api/mira/coaches",
    { name: null, email: "a@b.co", remember: true, topics: [], notified: [], chats: [] },
  ],
];

/** The read each screen's failure is about (the others load). */
let failing: { url: string; how: "server" | "network" } | null;
/** While set, a failing read's answer waits for it: a retry under way. */
let hold: Promise<void> | null;
const fetchMock = vi.fn(async (url: string) => {
  const fails = failing && url.split("?")[0] === failing.url ? failing.how : null;
  if (fails && hold) await hold;
  if (fails === "network") throw new TypeError("Failed to fetch");
  // Each route's own words for a failed read, which the screen never prints.
  if (fails) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: "Unable to load your things." }),
    } as Response;
  }
  const body = LOADED.find(([u]) => url.split("?")[0] === u)?.[1] ?? { success: true };
  return { ok: true, status: 200, json: async () => body } as Response;
});

/** The read a screen makes: the one its failure is about. */
const readOf = (name: string) =>
  ({
    "the goals page": "/api/mira/goals",
    "the journal page": "/api/mira/journal",
    "the journal's settings": "/api/mira/journal",
    Assessments: "/api/mira/checks",
    "a check's page": "/api/mira/checks",
    "the body check": "/api/mira/checks",
    "Settings' assessments": "/api/mira/checks",
    "Settings' weekly session": "/api/mira/weekly-session",
    "a voice session": `/api/mira/recordings/${ID}`,
    Settings: "/api/mira/me",
    "Home's chats": "/api/mira/me",
  })[name]!;

beforeEach(() => {
  failing = null;
  hold = null;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  sessionStorage.clear();
});

describe("a failed read on the pages that share Home's hooks", () => {
  for (const [name, mount, said] of SCREENS) {
    for (const how of ["server", "network"] as const) {
      it(`${name} says it one way, never in red, whatever the route said (${how})`, async () => {
        failing = { url: readOf(name), how };
        render(mount());
        const line = await screen.findByText(said);
        expect(line).toHaveAttribute("role", "alert");
        expect(screen.getByRole("button", { name: "Try again" })).toHaveAccessibleDescription(said);
        expect(document.body.textContent).not.toMatch(/Unable to|No connection|couldn’t|just now/);
        expect(line.closest("[class*='text-ap-bad']")).toBeNull();
        expect(line.parentElement?.innerHTML).not.toMatch(/text-ap-bad/);
      });
    }
  }

  for (const [name, mount, said, loaded] of SCREENS) {
    it(`${name} keeps Try again and its focus while it retries, says a second failure again, then hands the focus to its heading`, async () => {
      failing = { url: readOf(name), how: "server" };
      render(mount());
      const again = await screen.findByRole("button", { name: "Try again" });
      const first = screen.getByText(said);
      again.focus();

      let answer!: () => void;
      hold = new Promise<void>((r) => (answer = r));
      fireEvent.click(again);
      expect(again).toHaveFocus();
      expect(again).toHaveAttribute("aria-disabled", "true");
      // A second press waits for the retry under way.
      const asked = fetchMock.mock.calls.length;
      fireEvent.click(again);
      expect(fetchMock.mock.calls.length).toBe(asked);

      // It fails again: the same button, still focused, and the line said once more (a new
      // alert, as the same words left in place are never read out again).
      hold = null;
      answer();
      await waitFor(() => expect(again).not.toHaveAttribute("aria-disabled"));
      expect(again).toHaveFocus();
      const second = screen.getByText(said);
      expect(second).toHaveAttribute("role", "alert");
      expect(second).not.toBe(first);
      expect(again).toHaveAccessibleDescription(said);

      // It loads: the focus goes to the heading of what loaded, never to the page.
      failing = null;
      fireEvent.click(again);
      await waitFor(() => {
        expect(document.activeElement?.tagName).toMatch(/^H[12]$/);
        expect(document.activeElement?.textContent).toMatch(loaded);
      });
    });
  }
});

describe("a failed read said on Home's chats card", () => {
  it("is tied to its Try again, as every card's is (R4-UXA-4)", async () => {
    failing = { url: "/api/mira/me", how: "server" };
    render(<MiraHome hour={8} name="Robin" />);
    const card = within(
      (await screen.findByText("Your chats didn’t load.")).closest("section") as HTMLElement
    );
    expect(card.getByRole("button", { name: "Try again" })).toHaveAccessibleDescription(
      "Your chats didn’t load."
    );
  });
});
