// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MiraPayload } from "@features/admin/server/ap/mira";
import type { Ratings } from "@features/admin/server/ap/mira-ratings";

const quotes = vi.hoisted(() => ({
  list: [
    {
      id: 7,
      stars: 5,
      quote: "My husband Tom noticed I stopped hiding.",
      published: null,
      name: "Lea",
      age: "25–34",
      status: "pending",
      createdAt: "2026-11-24T10:00:00Z",
      counts: true,
    },
    {
      id: 8,
      stars: 4,
      quote: "Kind and clear.",
      published: "Kind and clear.",
      name: "Ana",
      age: null,
      status: "approved",
      createdAt: "2026-11-20T10:00:00Z",
      counts: true,
    },
  ],
}));
const refetch = vi.fn();
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: { quotes: quotes.list }, loading: false, error: null, refetch }),
}));

import { RatingsCard } from "@features/admin/ui/ap/ApMiraRatings";

const ratings: Ratings = {
  read: true,
  asked: 40,
  notNow: 12,
  given: 10,
  withdrawn: 1,
  average: 4.56,
  averaged: 9,
  afterAsk: 8,
  fromSettings: 1,
  words: 4,
  approved: 1,
  waiting: 1,
  live: { people: 12, quotes: 1, average: null, needs: 20 },
};
const show = (r: Ratings = ratings) =>
  render(<RatingsCard data={{ ratings: r } as unknown as MiraPayload} />);
const fetchMock = vi.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => ({}) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  refetch.mockClear();
});

describe("AP › Mira's Ratings card", () => {
  it("shows the range's figures and why nothing is on Mira's pages yet", () => {
    show();
    const card = screen.getByRole("region", { name: "Ratings" });
    expect(card).toHaveTextContent("Asks shown40");
    expect(card).toHaveTextContent("12 “Not now”");
    expect(card).toHaveTextContent("20.0% of the asks · 1 from Settings");
    expect(card).toHaveTextContent("Average rating4.6");
    expect(card).toHaveTextContent("1 approved in the range, 1 waiting now");
    expect(card).toHaveTextContent(
      "Not on Mira's pages yet: 12 of the 20 people needed have rated her, with 1 approved quote."
    );
    cleanup();
    show({ ...ratings, live: { people: 23, quotes: 2, average: 4.8, needs: 20 } });
    expect(screen.getByText(/On Mira's pages now: ★ 4.8, rated by 23 people/)).toBeInTheDocument();
  });

  it("lets staff approve only the person's words, with a detail at most cut out and marked", async () => {
    vi.stubGlobal("fetch", fetchMock);
    show();
    const item = screen.getByText(/My husband Tom/).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Take out a detail…" }));
    const box = within(item).getByRole("textbox");
    const approve = within(item).getByRole("button", { name: "Approve with this cut" });
    fireEvent.change(box, { target: { value: "My husband noticed I stopped hiding." } });
    expect(approve).toBeDisabled();
    expect(
      within(item).getByText(/Only take out a detail of up to three words/)
    ).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "My husband […] noticed I stopped hiding." } });
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/ap/mira/reviews");
    expect(JSON.parse(String(init.body))).toEqual({
      id: 7,
      decision: "approve",
      text: "My husband […] noticed I stopped hiding.",
    });
  });

  it("rejects only for a reason from the list, and says critical words are never one", async () => {
    vi.stubGlobal("fetch", fetchMock);
    show();
    expect(screen.getByRole("region", { name: "Ratings" })).toHaveTextContent(
      "Critical or negative words are never a reason to reject or take down a quote."
    );
    const item = screen.getByText(/My husband Tom/).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Reject…" }));
    const why = within(item).getByRole("group", { name: /Why not show it\?/ });
    // The pressed button is gone: the first reason takes the focus, for keyboard users.
    expect(document.activeElement).toBe(within(why).getAllByRole("radio")[0]);
    expect(
      within(why)
        .getAllByRole("radio")
        .map((r) => r.closest("label")!.textContent)
    ).toEqual([
      "Can’t remove identifying details",
      "Harmful or abusive",
      "Not about Mira",
      "Spam or duplicate",
    ]);
    const reject = within(why).getByRole("button", { name: "Reject" });
    expect(reject).toBeDisabled(); // no reason, no rejection
    fireEvent.click(within(why).getByRole("radio", { name: "Not about Mira" }));
    fireEvent.click(reject);
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      id: 7,
      decision: "reject",
      reason: "off_topic",
    });
  });

  it("takes a shown quote down only for a reason from the list", async () => {
    vi.stubGlobal("fetch", fetchMock);
    show();
    const shown = screen.getByText(/Kind and clear/).closest("li")!;
    fireEvent.click(within(shown).getByRole("button", { name: "Take down…" }));
    fireEvent.click(within(shown).getByRole("radio", { name: "Spam or duplicate" }));
    fireEvent.click(within(shown).getByRole("button", { name: "Take down" }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      id: 8,
      decision: "reject",
      reason: "spam",
    });
  });
});
