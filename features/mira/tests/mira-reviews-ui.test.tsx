// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { REVIEW_CONSENT_VERSION } from "@features/mira/reviews";
import { CONSENT_VERSION } from "@features/mira/server/config";
import MiraChat from "@features/mira/ui/MiraChat";
import { MiraRatingLine, ReviewsWelcome } from "@features/mira/ui/reviews/PublicReviews";
import { CONSENT_TEXT, ReviewAsk, reviewAskDue } from "@features/mira/ui/reviews/ReviewAsk";
import SharedReviewSettings from "@features/mira/ui/reviews/SharedReviewSettings";
import { shortDate } from "@features/mira/ui/kit/dates";

/** Mira's rating screens against a stand-in for her API (the routes are tested on their own). */
type Reply = { status?: number; body: unknown };
let replies: Record<string, (body: Record<string, unknown>) => Reply>;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const key = `${init.method ?? "GET"} ${url}`;
  const bare = `${init.method ?? "GET"} ${url.split("?")[0]}`;
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const r = (replies[key] ?? replies[bare])?.(body) ?? { body: { success: true } };
  const status = r.status ?? 200;
  return { ok: status < 400, status, json: async () => r.body } as Response;
});
const calls = (key: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url}`.startsWith(key))
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
const tracked = () =>
  calls("POST /api/mira/event")
    .filter((b) => b.type === "track")
    .map((b) => b.name);
const askCard = () => screen.queryByRole("region", { name: /that means a lot|helping/ });
const DAY = 24 * 60 * 60 * 1000;

const TODAY = {
  average: 4.8,
  people: 23,
  quote: { text: "Mira helped me stop hiding.", name: "Lea", age: "25–34" },
  initials: ["L", "A"],
};

beforeEach(() => {
  replies = {
    "GET /api/mira/me": () => ({ body: { profile: { style: {} }, chats: [] } }),
    "GET /api/mira/reviews": () => ({ body: { reviews: null } }),
    "GET /api/mira/reviews/mine": () => ({ body: { review: null, name: "Lea", canRate: true } }),
  };
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
});

describe("the thank-you ask", () => {
  const pick = (n: number) => fireEvent.click(screen.getByRole("radio", { name: `${n} stars` }));

  it("sends only the stars unless the person ticks the consent to show their words", async () => {
    const onClose = vi.fn();
    render(<ReviewAsk from="nps" onClose={onClose} />);
    await screen.findByText("Thank you, that means a lot.");
    expect(tracked()).toEqual(["review_prompt_shown"]);
    pick(5);
    fireEvent.change(screen.getByLabelText(/A sentence for others/), {
      target: { value: "Mira helped me stop hiding." },
    });
    expect(screen.getByLabelText("Shown as")).toHaveValue("Lea");
    expect(screen.getByText("Without the tick, only your stars are sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/You can see or take back what you shared in/);
    expect(calls("POST /api/mira/reviews")).toEqual([{ stars: 5, via: "ask" }]);
  });

  it("sends the words with the consent's version, the chosen name and age range", async () => {
    render(<ReviewAsk from="thumbs" onClose={() => {}} />);
    await screen.findByText("Glad this is helping.");
    pick(4);
    fireEvent.change(screen.getByLabelText(/A sentence for others/), {
      target: { value: "Kind and clear." },
    });
    fireEvent.change(screen.getByLabelText("Shown as"), { target: { value: "L." } });
    fireEvent.change(screen.getByLabelText(/Age range/), { target: { value: "35-44" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /show these words publicly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Our team reads every quote before it shows/);
    expect(calls("POST /api/mira/reviews")).toEqual([
      {
        stars: 4,
        via: "ask",
        words: {
          quote: "Kind and clear.",
          name: "L.",
          ageRange: "35-44",
          consent: REVIEW_CONSENT_VERSION,
        },
      },
    ]);
  });

  it("respects “Not now” for 30 days", async () => {
    const onClose = vi.fn();
    render(<ReviewAsk from="nps" onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalled();
    expect(tracked()).toEqual(["review_prompt_shown", "review_prompt_not_now"]);
    expect(calls("POST /api/mira/reviews")).toEqual([]);
    expect(reviewAskDue()).toBe(false);
    expect(reviewAskDue(Date.now() + 29 * DAY)).toBe(false);
    expect(reviewAskDue(Date.now() + 31 * DAY)).toBe(true);
  });

  it("never asks someone who rated already, and logs nothing; this browser waits 30 days", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({ body: { review: { stars: 5 }, name: null } });
    const onClose = vi.fn();
    render(<ReviewAsk from="thumbs" onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(askCard()).toBeNull();
    expect(tracked()).toEqual([]);
    // Rated already: no need to ask the server again at every thumbs-up or 9.
    expect(reviewAskDue()).toBe(false);
  });

  it("still thanks someone who rated already for their 9 or 10", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({ body: { review: { stars: 5 }, name: null } });
    const onClose = vi.fn();
    render(<ReviewAsk from="nps" onClose={onClose} />);
    const thanks = await screen.findByText("Thank you, that helps us a lot.");
    await waitFor(() => expect(document.activeElement).toBe(thanks)); // the pressed 9 is gone
    expect(screen.queryByRole("radio")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(tracked()).toEqual([]);
  });

  it("never asks someone who hasn't talked with Mira enough to rate, and logs nothing", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: { review: null, name: "Lea", canRate: false },
    });
    const onClose = vi.fn();
    render(<ReviewAsk from="thumbs" onClose={onClose} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(askCard()).toBeNull();
    expect(tracked()).toEqual([]);
    expect(reviewAskDue()).toBe(true);
  });

  it("says how ratings are collected: in Settings by anyone, and asked at moments like this", async () => {
    render(<ReviewAsk from="nps" onClose={() => {}} />);
    const card = (await screen.findByText("Thank you, that means a lot.")).closest("section")!;
    fireEvent.click(within(card).getByText("How we check reviews"));
    expect(within(card).getByText(/Anyone who has talked with Mira can rate her/)).toBeVisible();
  });

  it("keeps its consent wording with the version it was agreed in", () => {
    // Changing these words means a new REVIEW_CONSENT_VERSION in features/mira/reviews.ts.
    expect([REVIEW_CONSENT_VERSION, CONSENT_TEXT]).toEqual([
      "mira-review-2026-11-22",
      "I agree that Mira’s pages may show these words publicly, with the name and age range above. Our team reads them first and may take out a detail that could identify someone, marked […]; nothing else is changed. I can take this back in Settings at any time.",
    ]);
  });
});

describe("the moments in the chat", () => {
  const typeAndSend = (text: string) => {
    fireEvent.change(screen.getByLabelText("Message Mira"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  };
  /** Three replies in one chat, each with its thumbs; the second, optionally, a referral. */
  async function chatWithThreeReplies(second: Record<string, unknown> = {}) {
    let n = 0;
    replies["POST /api/mira/chat"] = () => {
      n++;
      return { body: { reply: `Reply ${n}`, sources: [], ...(n === 2 ? second : {}) } };
    };
    for (const text of ["one", "two", "three"]) {
      typeAndSend(text);
      await screen.findByText(`Reply ${["one", "two", "three"].indexOf(text) + 1}`);
    }
  }
  const thumbsUpAll = async () => {
    for (const b of screen.getAllByRole("button", { name: "Helpful" })) fireEvent.click(b);
    await waitFor(() => expect(calls("POST /api/mira/event").length).toBeGreaterThan(2));
  };

  it("asks after the third thumbs-up in one chat, signed in", async () => {
    render(<MiraChat signedIn initialChatId={null} />);
    await chatWithThreeReplies();
    await thumbsUpAll();
    expect(await screen.findByText("Glad this is helping.")).toBeInTheDocument();
  });

  it("never asks after a referral, nor signed out, nor within 30 days of the last ask", async () => {
    render(<MiraChat signedIn initialChatId={null} />);
    await chatWithThreeReplies({ refer: true });
    await thumbsUpAll();
    expect(calls("GET /api/mira/reviews/mine")).toEqual([]);
    cleanup();

    localStorage.setItem("mira.review.v1", JSON.stringify({ askedAt: Date.now() - 2 * DAY }));
    render(<MiraChat signedIn initialChatId={null} />);
    await chatWithThreeReplies();
    await thumbsUpAll();
    expect(calls("GET /api/mira/reviews/mine")).toEqual([]);
    expect(askCard()).toBeNull();
    cleanup();

    // Signed out (were the free messages ever more than one): ratings come from accounts only.
    localStorage.clear();
    localStorage.setItem("mira.consent.v1", JSON.stringify({ version: CONSENT_VERSION }));
    render(<MiraChat signedIn={false} initialChatId={null} />);
    await chatWithThreeReplies({ freeLeft: 5 });
    await thumbsUpAll();
    expect(calls("GET /api/mira/reviews/mine")).toEqual([]);
  });

  it("turns a 9 or 10 on the recommend question into the ask; an 8 just gets the thanks", async () => {
    localStorage.setItem("mira.nps.v1", JSON.stringify({ convos: 5, asked: null }));
    render(<MiraChat signedIn initialChatId={null} />);
    replies["POST /api/mira/chat"] = () => ({ body: { reply: "A reply", sources: [] } });
    typeAndSend("one");
    await screen.findByText("A reply");
    typeAndSend("two");
    fireEvent.click(await screen.findByRole("button", { name: "9 out of 10" }));
    const ask = await screen.findByText("Thank you, that means a lot.");
    // The pressed button is gone: the ask takes the focus, not the composer (no phone keyboard).
    await waitFor(() => expect(document.activeElement).toBe(ask));
    expect(screen.queryByText("Thank you, that helps us a lot.")).toBeNull();
    cleanup();
    fetchMock.mockClear();

    localStorage.clear();
    localStorage.setItem("mira.nps.v1", JSON.stringify({ convos: 5, asked: null }));
    render(<MiraChat signedIn initialChatId={null} />);
    typeAndSend("one");
    await screen.findByText("A reply");
    typeAndSend("two");
    fireEvent.click(await screen.findByRole("button", { name: "8 out of 10" }));
    expect(await screen.findByText("Thank you, that helps us a lot.")).toBeInTheDocument();
    expect(calls("GET /api/mira/reviews/mine")).toEqual([]);
  });

  it("never asks after a crisis reply in the chat", async () => {
    render(<MiraChat signedIn initialChatId={null} />);
    await chatWithThreeReplies({ crisis: true });
    await thumbsUpAll();
    expect(calls("GET /api/mira/reviews/mine")).toEqual([]);
  });
});

describe("what visitors see", () => {
  it("shows nothing at all until there are real ratings to show, not even an empty box", async () => {
    const { container } = render(<ReviewsWelcome place="under" />);
    await waitFor(() => expect(calls("GET /api/mira/reviews")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0)); // the answer has landed
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the rating, one quote and how we check reviews", async () => {
    replies["GET /api/mira/reviews"] = () => ({ body: { reviews: TODAY } });
    render(<ReviewsWelcome place="foot" />);
    const block = await screen.findByRole("region", { name: "What people say about Mira" });
    expect(block).toHaveTextContent("4.8 out of 5 · rated by 23 people");
    expect(block).toHaveTextContent("“Mira helped me stop hiding.” — Lea, 25–34");
    fireEvent.click(within(block).getByText("How we check reviews"));
    // How ratings are collected and checked (UWG §5b(3)), as the audit of 22 Nov 2026 asked.
    expect(within(block).getByText(/Anyone who has talked/)).toHaveTextContent(
      "Only people who have talked with Mira can rate her, once each, and our team’s own " +
        "accounts never count. Anyone who has talked with Mira can rate her in Settings, and we " +
        "also ask after someone says they’d recommend her or likes several of her answers. " +
        "Every rating counts, high or low. We read each quote before it shows and remove only " +
        "identifying details, harmful words, spam or text that isn’t about Mira, never because " +
        "it’s critical."
    );
  });

  it("gives Mira's roster card the rating line only when there is one", async () => {
    const first = render(<MiraRatingLine />);
    await waitFor(() => expect(calls("GET /api/mira/reviews")).toHaveLength(1));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    replies["GET /api/mira/reviews"] = () => ({ body: { reviews: TODAY } });
    render(<MiraRatingLine />);
    expect(await screen.findByText(/rated by/)).toHaveTextContent("rated by 23 people");
  });
});

describe("Settings: what you shared", () => {
  const mine = {
    stars: 5,
    createdAt: "2026-11-22T10:00:00Z",
    quote: "My husband Tom noticed I stopped hiding.",
    published: "My husband […] noticed I stopped hiding.",
    status: "approved",
    name: "Lea",
    age: "25–34",
  };

  it("ends initials with one full stop, not two (SET-16)", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: { review: { ...mine, status: "pending", name: "R.", age: null }, name: "Lea" },
    });
    render(<SharedReviewSettings />);
    expect(
      await screen.findByText("Waiting for our team to read it. Once approved, it shows as R.")
    ).toBeInTheDocument();
  });

  it("shows the writer the team's reason when their words weren't shown", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: {
        review: { ...mine, quote: null, published: null, status: "rejected", reason: "harmful" },
        name: "Lea",
        canRate: false,
      },
    });
    render(<SharedReviewSettings />);
    expect(
      await screen.findByText(/Your words aren’t shown, and we didn’t keep them\./)
    ).toHaveTextContent("Our team’s reason: Harmful or abusive.");
  });

  // Round-3 R3-ACCT-9 (SET-12): its own en-GB date said "22 Sept" in Chromium and Firefox.
  it("dates the rating the way every Mira date reads", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: { review: { ...mine, createdAt: "2026-09-22T10:00:00Z" }, name: "Lea" },
    });
    render(<SharedReviewSettings />);
    const line = await screen.findByText(/You rated Mira 5 out of 5/);
    expect(line).toHaveTextContent(`on ${shortDate("2026-09-22T10:00:00Z")}.`);
    expect(line).toHaveTextContent(/on 22 Sep( 2026)?\./);
  });

  it("shows the rating and where the words stand, and takes the words back", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({ body: { review: mine, name: "Lea" } });
    render(<SharedReviewSettings />);
    expect(await screen.findByText(/You rated Mira 5 out of 5/)).toBeInTheDocument();
    expect(screen.getByText(/Shown on Mira’s pages as Lea, 25–34/)).toBeInTheDocument();
    expect(screen.getByText(/took out a detail that could identify someone/)).toBeInTheDocument();
    // Round-2 CHAT-7: changing a rating is remove-and-rate-again, and the section says so.
    expect(
      screen.getByText("To change your stars or your words, remove this rating and rate again.")
    ).toBeInTheDocument();
    // The writer sees exactly what changed.
    expect(
      screen.getByText(/You wrote: “My husband Tom noticed I stopped hiding\.”/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop showing my words" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your words are no longer shown, and we’ve deleted them."
    );
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => i?.method === "DELETE" && u === "/api/mira/reviews/mine?what=words"
      )
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Stop showing my words" })).toBeNull();
    // The pressed button went: the focus stays in the section, on its heading.
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Your rating of Mira" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove my rating" }));
    // Gone, and open to rate again.
    expect(await screen.findByRole("heading", { name: "Rate Mira" })).toBeInTheDocument();
  });

  it("lets anyone who has talked with Mira rate her there, high or low, words with consent", async () => {
    render(<SharedReviewSettings />);
    await screen.findByRole("heading", { name: "Rate Mira" });
    fireEvent.click(screen.getByRole("radio", { name: "1 star" }));
    fireEvent.change(screen.getByLabelText(/A sentence for others/), {
      target: { value: "Not for me, too slow." },
    });
    expect(screen.getByLabelText("Shown as")).toHaveValue("Lea");
    fireEvent.click(screen.getByRole("checkbox", { name: CONSENT_TEXT }));
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: {
        review: {
          stars: 1,
          createdAt: "2026-11-22T10:00:00Z",
          quote: "Not for me, too slow.",
          published: null,
          status: "pending",
          reason: null,
          name: "Lea",
          age: null,
        },
        name: "Lea",
        canRate: false,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/You rated Mira 1 out of 5/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Thank you. Your rating is in, and our team reads your words before they show."
    );
    expect(calls("POST /api/mira/reviews")).toEqual([
      {
        stars: 1,
        via: "settings",
        words: {
          quote: "Not for me, too slow.",
          name: "Lea",
          ageRange: null,
          consent: REVIEW_CONSENT_VERSION,
        },
      },
    ]);
    // Not the chat's ask: nothing about an ask is counted.
    expect(tracked()).toEqual([]);
  });

  it("after an under-18 stop on this browser, offers taking a rating back, never a dead retry", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      status: 403,
      body: { error: "Not available.", minor: true },
    });
    render(<SharedReviewSettings />);
    expect(await screen.findByText("Mira is only for adults.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText(/couldn’t load/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove my rating" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Nothing this account rated is kept or shown."
    );
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => i?.method === "DELETE" && u === "/api/mira/reviews/mine?what=all"
      )
    ).toBe(true);
  });

  it("says when nothing is shared yet, and when it can't load", async () => {
    replies["GET /api/mira/reviews/mine"] = () => ({
      body: { review: null, name: "Lea", canRate: false },
    });
    render(<SharedReviewSettings />);
    expect(
      await screen.findByText(
        "You can rate Mira once you’ve talked with her a little: three messages of your own."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    cleanup();
    replies["GET /api/mira/reviews/mine"] = () => ({ status: 500, body: { error: "x" } });
    render(<SharedReviewSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load what you shared.");
  });
});
