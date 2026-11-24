// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackLandingCardAnswer = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackLandingCardAnswer: (...args: unknown[]) => trackLandingCardAnswer(...args),
}));

import { useLandingPick, type LandingPickLocation } from "@features/landing/logic/landingPick";
import { LANDING_PREFILL_QID, SURVEY_STATE_KEY } from "@features/survey/ui/hooks/surveyStorage";

/**
 * Question 1's answer on a landing page is one value, wherever it is asked: the video
 * page's hero and closing cards, and the new page's hero question. Every reader of the
 * hook sees the same pick, read from the survey draft the answer is saved into.
 */
const Reader: React.FC<{
  id: string;
  picks?: Array<[number, LandingPickLocation]>;
  /** The question the page asks: the video page's (Q01002) when unset. */
  qId?: string;
}> = ({ id, picks = [], qId }) => {
  const { selected, pick } = useLandingPick(qId);
  return (
    <div>
      <span data-testid={id}>{selected === null ? "none" : String(selected)}</span>
      {picks.map(([value, location]) => (
        <button key={`${value}-${location}`} type="button" onClick={() => pick(value, location)}>
          {`pick ${value} ${location}`}
        </button>
      ))}
    </div>
  );
};

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("useLandingPick — one answer to question 1 per landing page", () => {
  beforeEach(() => {
    localStorage.clear();
    trackLandingCardAnswer.mockClear();
  });
  afterEach(cleanup);

  it("shows a pick made through one reader in every other reader", () => {
    render(
      <>
        <Reader id="a" picks={[[3, "hero"]]} />
        <Reader id="b" />
      </>
    );
    expect(screen.getByTestId("a").textContent).toBe("none");
    press("pick 3 hero");
    expect(screen.getByTestId("a").textContent).toBe("3");
    expect(screen.getByTestId("b").textContent).toBe("3");
  });

  it("saves the pick into the survey draft as question 1's prefilled answer", () => {
    render(<Reader id="a" picks={[[6, "hero"]]} />);
    press("pick 6 hero");
    const draft = JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) ?? "{}");
    expect(draft.answers[LANDING_PREFILL_QID]).toBe(6);
    expect(draft.prefilled).toContain(LANDING_PREFILL_QID);
  });

  it("reads an answer already in the draft on mount", () => {
    localStorage.setItem(
      SURVEY_STATE_KEY,
      JSON.stringify({ answers: { [LANDING_PREFILL_QID]: 5 }, prefilled: [LANDING_PREFILL_QID] })
    );
    render(<Reader id="a" />);
    expect(screen.getByTestId("a").textContent).toBe("5");
  });

  it("keeps the pain-point page's version C on its own question, Q10003", () => {
    // Sync 24 Nov 2026: version C asks Q10003. Its pick is that question's answer, prefilled
    // so the survey skips it, and never shows as question 1's.
    render(
      <>
        <Reader id="c" qId="10003" picks={[[2, "hero"]]} />
        <Reader id="q1" />
      </>
    );
    press("pick 2 hero");
    expect(screen.getByTestId("c").textContent).toBe("2");
    expect(screen.getByTestId("q1").textContent).toBe("none");
    const draft = JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) ?? "{}");
    expect(draft.answers).toEqual({ "10003": 2 });
    expect(draft.prefilled).toEqual(["10003"]);
    expect(trackLandingCardAnswer).toHaveBeenLastCalledWith({
      location: "hero",
      changed: false,
      value: 2,
      question: "10003",
    });
  });

  it("reports the first pick as new and a later one as a change", () => {
    render(
      <Reader
        id="a"
        picks={[
          [3, "hero"],
          [4, "footer"],
        ]}
      />
    );
    press("pick 3 hero");
    expect(trackLandingCardAnswer).toHaveBeenLastCalledWith({
      location: "hero",
      changed: false,
      value: 3,
      question: LANDING_PREFILL_QID,
    });
    press("pick 4 footer");
    expect(trackLandingCardAnswer).toHaveBeenLastCalledWith({
      location: "footer",
      changed: true,
      value: 4,
      question: LANDING_PREFILL_QID,
    });
  });
});
