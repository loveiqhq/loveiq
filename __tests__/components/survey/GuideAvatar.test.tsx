// @vitest-environment jsdom
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GuideAvatar from "@/components/survey/GuideAvatar";
import type { ChapterIntro } from "@/data/survey-data";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const chapterIntro: ChapterIntro = {
  chapter: "Chapter 1",
  text: "Welcome to this chapter",
} as ChapterIntro;

describe("GuideAvatar", () => {
  it("renders orb button", () => {
    render(<GuideAvatar chapterIntro={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: /guide avatar/i })).toBeInTheDocument();
  });

  it("shows popup after 400ms delay when chapterIntro provided", async () => {
    render(<GuideAvatar chapterIntro={chapterIntro} onDismiss={vi.fn()} />);

    // Not visible immediately
    expect(screen.queryByText("Welcome to this chapter")).not.toBeInTheDocument();

    // Advance past the 400ms delay
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText("Welcome to this chapter")).toBeInTheDocument();
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
  });

  it("calls onDismiss after dismiss delay when Got it clicked", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GuideAvatar chapterIntro={chapterIntro} onDismiss={onDismiss} />);

    // Show popup
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await user.click(screen.getByRole("button", { name: /got it/i }));

    // onDismiss called after 250ms delay
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("hides popup after dismiss", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GuideAvatar chapterIntro={chapterIntro} onDismiss={vi.fn()} />);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await user.click(screen.getByRole("button", { name: /got it/i }));

    // Popup should be gone
    expect(screen.queryByText("Welcome to this chapter")).not.toBeInTheDocument();
  });

  it("clicking orb shows popup when chapterIntro exists and popup is hidden", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<GuideAvatar chapterIntro={chapterIntro} onDismiss={vi.fn()} />);

    // Show popup via timer, dismiss it
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await user.click(screen.getByRole("button", { name: /got it/i }));

    // Now click orb to reopen
    await user.click(screen.getByRole("button", { name: /guide avatar/i }));

    expect(screen.getByText("Welcome to this chapter")).toBeInTheDocument();
  });

  it("cleans up timeout on unmount", () => {
    const { unmount } = render(<GuideAvatar chapterIntro={chapterIntro} onDismiss={vi.fn()} />);

    unmount();

    // Advancing timers should not cause errors
    act(() => {
      vi.advanceTimersByTime(500);
    });
  });
});
