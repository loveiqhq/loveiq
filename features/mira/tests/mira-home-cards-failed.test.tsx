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

const CARDS: Array<[region: string, said: string]> = [
  ["Daily journal", "Your journal didn’t load."],
  ["Challenges & goals", "Your goals didn’t load."],
  ["Your weekly session", "Your weekly session didn’t load."],
  ["Picked for you", "Your picks didn’t load."],
  ["Your assessments", "Your assessments didn’t load."],
  ["Your coaches", "Your coaches didn’t load."],
  ["Voice sessions", "Your voice sessions didn’t load."],
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
const fetchMock = vi.fn(async (url: string) => {
  if (failing === "network") throw new TypeError("Failed to fetch");
  if (failing === "server") {
    return { ok: false, status: 500, json: async () => ({ error: "Unable to load." }) } as Response;
  }
  const body = url.startsWith("/api/mira/goals") ? { goals: [] } : { success: true };
  return { ok: true, status: 200, json: async () => body } as Response;
});

beforeEach(() => {
  failing = "server";
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
});
