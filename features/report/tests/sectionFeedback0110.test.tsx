// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/analytics/client", () => ({ trackChapterFeedbackSubmitted: vi.fn() }));
vi.mock("@shared/http/csrf-client", () => ({ getCsrfToken: () => "csrf" }));

import { trackChapterFeedbackSubmitted } from "@features/analytics/client";
import SectionFeedback from "@features/report/ui/SectionFeedback";
import { useSectionFeedback } from "@features/report/ui/hooks/useSectionFeedback";

/**
 * Marcus, review 01.10: "Let's not force users to store a message when rating. Ergo
 * store the rating also without 'send'" (Fatih's screen recording, "store a message":
 * a thumb opened the message box, and only Send stored anything). The thumb now stores
 * the rating on its own; the message stays optional, and Send adds it to the same row.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(trackChapterFeedbackSubmitted).mockClear();
});

const up = () => screen.getByRole("button", { name: "This resonates: Typical Beliefs" });
const down = () => screen.getByRole("button", { name: "This does not resonate: Typical Beliefs" });

describe("SectionFeedback — the thumb stores the rating (01.10)", () => {
  const renderWidget = (overrides: Partial<Parameters<typeof SectionFeedback>[0]> = {}) => {
    const onRate = vi.fn().mockResolvedValue(true);
    const onFeedback = vi.fn().mockResolvedValue(true);
    const view = render(
      <SectionFeedback
        sectionTitle="Typical Beliefs"
        value={null}
        isSent={false}
        onRate={onRate}
        onFeedback={onFeedback}
        {...overrides}
      />
    );
    return { onRate, onFeedback, ...view };
  };

  it("rates on the click and opens the optional message, nothing else needed", async () => {
    const { onRate, onFeedback } = renderWidget();
    await act(async () => fireEvent.click(up()));
    expect(onRate).toHaveBeenCalledWith("up");
    expect(onFeedback).not.toHaveBeenCalled();
    expect(up()).toHaveClass("is-selected");
    expect(screen.getByPlaceholderText("Add a comment (optional)...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Rating saved");
  });

  it("keeps the rating when the message is cancelled", async () => {
    renderWidget();
    await act(async () => fireEvent.click(up()));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("Add a comment (optional)...")).toBeNull();
    expect(up()).toHaveClass("is-selected");
  });

  it("adds the message to the rating on Send", async () => {
    const { onFeedback } = renderWidget();
    await act(async () => fireEvent.click(up()));
    fireEvent.change(screen.getByPlaceholderText("Add a comment (optional)..."), {
      target: { value: "Spot on" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    expect(onFeedback).toHaveBeenCalledWith({ feedback: "up", comment: "Spot on" });
    expect(screen.getByText("Feedback sent!")).toBeInTheDocument();
  });

  it("lets the reader switch the rating, before and after a message", async () => {
    const { onRate } = renderWidget({ value: "up", isSent: true });
    expect(up()).not.toBeDisabled();
    expect(down()).not.toBeDisabled();
    await act(async () => fireEvent.click(down()));
    expect(onRate).toHaveBeenCalledWith("down");
    expect(down()).toHaveClass("is-selected");
    expect(up()).not.toHaveClass("is-selected");
  });

  it("does not post again for the thumb already saved: it only toggles the message", async () => {
    const { onRate } = renderWidget({ value: "up" });
    await act(async () => fireEvent.click(up()));
    expect(onRate).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Add a comment (optional)...")).toBeInTheDocument();
  });

  it("says so, and takes the choice back, when the rating could not be saved", async () => {
    renderWidget({ onRate: vi.fn().mockResolvedValue(false) });
    await act(async () => fireEvent.click(up()));
    expect(up()).not.toHaveClass("is-selected");
    expect(screen.getByText("Couldn’t save that")).toBeInTheDocument();
  });

  it("says so when the message could not be sent", async () => {
    renderWidget({ onFeedback: vi.fn().mockResolvedValue(false) });
    await act(async () => fireEvent.click(up()));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    expect(screen.queryByText("Feedback sent!")).toBeNull();
    expect(screen.getByText("Couldn’t save that")).toBeInTheDocument();
  });
});

describe("useSectionFeedback — one row per section, the rating first (01.10)", () => {
  const ok = (status = 200) => ({ ok: status < 400, status });
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
  });
  const body = (call = 0) => JSON.parse(fetchMock.mock.calls[call]![1].body as string);

  it("posts the rating alone, and remembers it", async () => {
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let saved = false;
    await act(async () => {
      saved = await result.current.rateSection("typical_beliefs", "up");
    });
    expect(saved).toBe(true);
    expect(body()).toEqual({
      feedback: "up",
      sectionId: "typical_beliefs",
      token: "rpt_abcdefghijklmnopqrst",
    });
    expect(result.current.feedbacks.typical_beliefs).toBe("up");
    expect(result.current.submitted.typical_beliefs).toBeFalsy();
    expect(trackChapterFeedbackSubmitted).toHaveBeenCalledWith({
      section_id: "typical_beliefs",
      feedback: "up",
      has_comment: false,
      step: "rating",
    });
  });

  it("takes the rating back when the server refuses it", async () => {
    fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok(400));
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    await act(async () => {
      await result.current.rateSection("typical_beliefs", "up");
    });
    let saved = true;
    await act(async () => {
      saved = await result.current.rateSection("typical_beliefs", "down");
    });
    expect(saved).toBe(false);
    expect(result.current.feedbacks.typical_beliefs).toBe("up");
  });

  it("sends the message to the same row and only then counts it sent", async () => {
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let sent = false;
    await act(async () => {
      sent = await result.current.submitFeedback("typical_beliefs", {
        feedback: "down",
        issue: "unclear",
        comment: "Lost me",
      });
    });
    expect(sent).toBe(true);
    expect(body()).toMatchObject({ feedback: "down", issue: "unclear", comment: "Lost me" });
    expect(result.current.submitted.typical_beliefs).toBe(true);
    expect(trackChapterFeedbackSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ step: "message", has_comment: true, issue: "unclear" })
    );
  });

  it("does not count a refused message as sent", async () => {
    fetchMock.mockResolvedValue(ok(400));
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let sent = true;
    await act(async () => {
      sent = await result.current.submitFeedback("typical_beliefs", { feedback: "up" });
    });
    expect(sent).toBe(false);
    expect(result.current.submitted.typical_beliefs).toBeFalsy();
  });

  it("posts nothing without a session or a token (the staging preview), and still shows the choice", async () => {
    const { result } = renderHook(() => useSectionFeedback(null, null));
    let saved = false;
    await act(async () => {
      saved = await result.current.rateSection("typical_beliefs", "up");
    });
    expect(saved).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.feedbacks.typical_beliefs).toBe("up");
  });
});

/**
 * Final review, 01.10: a rating switched within a post's round trip. Posts for a section
 * go out one after the other, in click order, so the row ends on the last click; a post
 * that fails after a newer click changes nothing on screen; and a refused latest rating
 * goes back to the last one the server confirmed, not to whatever the click replaced.
 */
describe("useSectionFeedback — a rating switched before the first one lands", () => {
  const ok = (status = 200) => ({ ok: status < 400, status });
  /** A fetch whose answers the test releases one by one. */
  const held = () => {
    const releases: ((value: { ok: boolean; status: number }) => void)[] = [];
    const fetchMock = vi.fn(
      () => new Promise<{ ok: boolean; status: number }>((resolve) => releases.push(resolve))
    );
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, releases };
  };
  const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body).feedback);

  it("posts in click order: the second waits for the first", async () => {
    const { fetchMock, releases } = held();
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.rateSection("typical_beliefs", "up");
      second = result.current.rateSection("typical_beliefs", "down");
    });
    await act(async () => {});
    expect(sent(fetchMock)).toEqual(["up"]);
    await act(async () => {
      releases[0]!(ok());
      await first;
    });
    expect(sent(fetchMock)).toEqual(["up", "down"]);
    await act(async () => {
      releases[1]!(ok());
      await second;
    });
    expect(result.current.feedbacks.typical_beliefs).toBe("down");
  });

  it("lets a failure behind a newer click change nothing", async () => {
    const { releases } = held();
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.rateSection("typical_beliefs", "up");
      second = result.current.rateSection("typical_beliefs", "down");
    });
    // The queue starts the first post on the next tick.
    await act(async () => {});
    let firstSaved: boolean | undefined;
    await act(async () => {
      releases[0]!(ok(500));
      firstSaved = await first;
    });
    // Superseded: nothing to take back, no failure to show.
    expect(firstSaved).toBe(true);
    expect(result.current.feedbacks.typical_beliefs).toBe("down");
    await act(async () => {
      releases[1]!(ok());
      expect(await second).toBe(true);
    });
    expect(result.current.feedbacks.typical_beliefs).toBe("down");
  });

  it("takes a refused latest rating back to the last one stored", async () => {
    const { releases } = held();
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.rateSection("typical_beliefs", "up");
      second = result.current.rateSection("typical_beliefs", "down");
    });
    await act(async () => {});
    await act(async () => {
      releases[0]!(ok(500));
      await first;
    });
    await act(async () => {
      releases[1]!(ok(500));
      expect(await second).toBe(false);
    });
    // Neither was stored: back to nothing, not to the "up" that also failed.
    expect(result.current.feedbacks.typical_beliefs).toBeNull();
  });

  it("queues Send behind a rating still in flight", async () => {
    const { fetchMock, releases } = held();
    const { result } = renderHook(() => useSectionFeedback(null, "rpt_abcdefghijklmnopqrst"));
    let rating!: Promise<boolean>;
    let message!: Promise<boolean>;
    act(() => {
      rating = result.current.rateSection("typical_beliefs", "down");
      message = result.current.submitFeedback("typical_beliefs", {
        feedback: "down",
        issue: "unclear",
      });
    });
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      releases[0]!(ok());
      await rating;
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      releases[1]!(ok());
      expect(await message).toBe(true);
    });
  });
});

describe("SectionFeedback — a result that arrives after a newer click", () => {
  it("is ignored: no failure, the newer choice and its box stay", async () => {
    const resolvers: ((value: boolean) => void)[] = [];
    const onRate = vi.fn(() => new Promise<boolean>((resolve) => resolvers.push(resolve)));
    render(
      <SectionFeedback
        sectionTitle="Typical Beliefs"
        value={null}
        isSent={false}
        onRate={onRate}
        onFeedback={vi.fn().mockResolvedValue(true)}
      />
    );
    await act(async () => fireEvent.click(up()));
    await act(async () => fireEvent.click(down()));
    await act(async () => resolvers[0]!(false));
    expect(screen.queryByText("Couldn’t save that")).toBeNull();
    expect(down()).toHaveClass("is-selected");
    expect(screen.getByText("Select an issue...")).toBeInTheDocument();
    await act(async () => resolvers[1]!(true));
    expect(down()).toHaveClass("is-selected");
  });
});
