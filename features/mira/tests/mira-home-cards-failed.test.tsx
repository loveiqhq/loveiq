// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import ChecksHomeCard from "@features/mira/ui/checks/ChecksHomeCard";
import CoachesCard from "@features/mira/ui/coaches/CoachesCard";
import PicksCard from "@features/mira/ui/coaches/PicksCard";
import GoalsCard from "@features/mira/ui/goals/GoalsCard";
import { JournalCard } from "@features/mira/ui/journal/JournalCard";
import { RecordingsCard } from "@features/mira/ui/recordings/Recordings";
import { NextSessionCard } from "@features/mira/ui/weekly-session/NextSessionCard";

/**
 * Round-3 SET-11: with every read failing, Home's habit cards said it three ways, with two styles
 * of Try again and two cards in red. Each now says "<what> didn’t load." with the same Try again,
 * never red: nothing the person did is wrong.
 */

/** Each card: its region while it failed, what it says, and its heading once it has loaded. */
const CARDS: Array<[region: string, said: string, loaded: string]> = [
  ["Daily journal", "Your journal didn’t load.", "Daily journal"],
  ["Challenges & goals", "Your goals didn’t load.", "Challenges & goals"],
  ["Your weekly session", "Your weekly session didn’t load.", "A weekly 15 minutes with Mira"],
  ["Picked for you", "Your picks didn’t load.", "Picked for you"],
  ["Your assessments", "Your assessments didn’t load.", "Your assessments"],
  ["Your coaches", "Your coaches didn’t load.", "Your coaches"],
  ["Voice sessions", "Your voice sessions didn’t load.", "Voice sessions"],
];

/** What each read answers once it loads: every card's empty state. */
const LOADED: Array<[url: string, body: unknown]> = [
  ["/api/mira/goals", { goals: [] }],
  ["/api/mira/journal", { entries: [], settings: { reminderTime: null } }],
  ["/api/mira/weekly-session", { slot: null, timeZone: "Europe/Berlin" }],
  [
    "/api/mira/coaches",
    { name: null, email: "a@b.co", remember: true, topics: [], notified: [], chats: [] },
  ],
  [
    "/api/mira/checks",
    {
      account: "u1",
      email: "a@b.co",
      name: null,
      useChecks: false,
      useAssessment: false,
      support: "DE",
      checks: ["anxiety", "mood", "loneliness"].map((id) => ({ id, results: [], nextAt: null })),
      bodyCheck: null,
      assessment: null,
    },
  ],
  ["/api/mira/recordings", { recordings: [], more: false }],
];

const home = () =>
  render(
    <>
      <JournalCard />
      <GoalsCard />
      <NextSessionCard />
      <PicksCard />
      <ChecksHomeCard />
      <RecordingsCard />
      <CoachesCard />
    </>
  );

let failing: "server" | "network" | null;
/** While set, every request waits for it: a retry under way. */
let hold: Promise<void> | null;
const fetchMock = vi.fn(async (url: string) => {
  const how = failing; // as it was asked, whenever it answers
  if (hold) await hold;
  if (how === "network") throw new TypeError("Failed to fetch");
  if (how === "server") {
    return { ok: false, status: 500, json: async () => ({ error: "Unable to load." }) } as Response;
  }
  const body = LOADED.find(([u]) => url.startsWith(u))?.[1] ?? { success: true };
  return { ok: true, status: 200, json: async () => body } as Response;
});

beforeEach(() => {
  failing = "server";
  hold = null;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("Home's habit cards when their reads fail", () => {
  for (const way of ["server", "network"] as const) {
    it(`say it one way, with one Try again and no red (${way})`, async () => {
      failing = way;
      home();
      const buttons: string[] = [];
      for (const [name, said] of CARDS) {
        await waitFor(() => within(screen.getByRole("region", { name })).getByText(said));
        const card = within(screen.getByRole("region", { name }));
        const again = card.getByRole("button", { name: "Try again" });
        // Seven of them on Home: each says what it tries again.
        expect(again).toHaveAccessibleDescription(said);
        buttons.push(again.className);
      }
      expect(new Set(buttons).size).toBe(1);
      expect(document.body.innerHTML).not.toMatch(/text-ap-bad-ink/);
      expect(document.body.textContent).not.toMatch(/Unable to|No connection|couldn’t/);
    });
  }

  it("loads a card again with its Try again", async () => {
    home();
    // Every card has failed (and asked for nothing more) before the network comes back.
    for (const [name] of CARDS) {
      await waitFor(() =>
        within(screen.getByRole("region", { name })).getByRole("button", { name: "Try again" })
      );
    }
    const goals = within(screen.getByRole("region", { name: "Challenges & goals" }));
    failing = null;
    fireEvent.click(goals.getByRole("button", { name: "Try again" }));
    expect(await goals.findByRole("link", { name: "Ask Mira to help" })).toBeInTheDocument();
  });

  // Round 4: each card swapped Try again for its placeholder at once, dropping keyboard focus to
  // the page. As Home's chats card does (R3-UXA-7), Try again keeps the focus, aria-disabled,
  // until the retry answers; once the card has loaded, its heading has the focus.
  it("keeps Try again, and its focus, while a card retries, then gives the focus to its heading", async () => {
    home();
    for (const [name] of CARDS) {
      await waitFor(() =>
        within(screen.getByRole("region", { name })).getByRole("button", { name: "Try again" })
      );
    }
    for (const [name, , loaded] of CARDS) {
      const again = within(screen.getByRole("region", { name })).getByRole("button", {
        name: "Try again",
      });
      again.focus();
      // A retry that fails again: the same button, focused throughout, ready again.
      let answer!: () => void;
      hold = new Promise<void>((r) => (answer = r));
      fireEvent.click(again);
      expect(again, name).toHaveFocus();
      expect(again, name).toHaveAttribute("aria-disabled", "true");
      // A second press waits for the retry under way.
      const asked = fetchMock.mock.calls.length;
      fireEvent.click(again);
      expect(fetchMock.mock.calls.length, name).toBe(asked);
      hold = null;
      answer();
      await waitFor(() => expect(again, name).not.toHaveAttribute("aria-disabled"));
      expect(again, name).toHaveFocus();
      // A retry that loads: the card's heading has the focus, never the page.
      failing = null;
      fireEvent.click(again);
      await waitFor(() => expect(screen.getByRole("heading", { name: loaded })).toHaveFocus());
      failing = "server";
    }
  });
});
