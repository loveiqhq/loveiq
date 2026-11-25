// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Survey 2.0 in the real question screen, with the real question data: 16016 asked on two
 * screens (the areas, then the topics inside them), and new areas dropping the topics outside
 * them from the draft.
 */
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  trackSurveyGuidanceExpanded: vi.fn(),
  trackSurveyPause: vi.fn(),
  trackOptInSheetShown: vi.fn(),
  trackOptInSheetClosed: vi.fn(),
  trackSurveySheetShown: vi.fn(),
  trackSurveySheetClosed: vi.fn(),
  setReportSubmissionContext: vi.fn(),
  setSurveyVariant: vi.fn(),
}));
const run = vi.hoisted(() => ({
  submit: vi.fn(),
  clear: vi.fn(),
  status: "idle" as "idle" | "error",
  errorKind: null as string | null,
}));
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: run.submit,
    retryPending: vi.fn(),
    clearPendingCompletion: run.clear,
    status: run.status,
    errorKind: run.errorKind,
    hasPendingCompletion: false,
  }),
}));
// The animated steps after the last screen, as the classic engine test stands them in.
vi.mock("@features/survey/ui/ProcessingSequence", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Finish Processing</button>
  ),
}));
vi.mock("@features/survey/ui/hooks/usePartialSave", () => ({
  usePartialSave: () => ({ savePartial: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useUtmCapture", () => ({
  useUtmCapture: () => ({ utm: null }),
}));

import { surveyQuestions } from "@/data/survey-data";
import SurveyEngine from "@features/survey/ui/SurveyEngine";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { SURVEY_SESSION_KEY } from "@features/survey/ui/hooks/surveySession";
import { optInLabels } from "@features/survey/survey2/details";

const SCREENS = orderAskedQuestions(surveyQuestions, "survey2");
const at = (qId: string) => SCREENS.findIndex((q) => q.qId === qId);
const DATING = "Dating & Finding Love";
const WORK = "Work, Purpose & Money";
const STUCK = "Feeling stuck in your career";

const draft = () =>
  JSON.parse(localStorage.getItem("loveiq-survey-answers") ?? "{}") as {
    answers: Record<string, unknown>;
  };

beforeEach(() => {
  // jsdom draws no layout: the country search scrolls its highlighted option into view.
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(SURVEY_SESSION_KEY, "00000000-0000-4000-8000-000000000001");
  localStorage.setItem(
    "loveiq-survey-answers",
    JSON.stringify({
      answers: {},
      currentIndex: at("16016a"),
      startedAt: new Date().toISOString(),
      prefilled: [],
      orderArm: "survey2",
    })
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// The Survey 2.0 test (Mark, sync of 25 Nov 2026): with the switch on, a fresh run's session id
// deals it 2.0 (the variant) or the new order (the control, the question order test's winner).
describe("the Survey 2.0 test's halves, for a fresh run with the switch on", () => {
  const firstOf = (arm: "variant" | "survey2") => orderAskedQuestions(surveyQuestions, arm)[0]!;

  it("asks the control half the new order", async () => {
    localStorage.removeItem("loveiq-survey-answers");
    sessionStorage.setItem(SURVEY_SESSION_KEY, "00000000-0000-4000-8000-000000000000");
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    expect(
      await screen.findByRole("heading", { name: firstOf("variant").question })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: firstOf("survey2").question })).toBeNull();
  });

  it("asks the variant half Survey 2.0", async () => {
    localStorage.removeItem("loveiq-survey-answers");
    sessionStorage.setItem(SURVEY_SESSION_KEY, "00000000-0000-4000-8000-000000000001");
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    expect(
      await screen.findByRole("heading", { name: firstOf("survey2").question })
    ).toBeInTheDocument();
  });
});

describe("Survey 2.0's two 16016 screens", () => {
  it("asks the areas, then only the topics inside them", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await screen.findByText(
      "Beyond sex, which areas would you most like to understand about yourself?"
    );
    await user.click(screen.getByText(DATING));
    await user.click(screen.getByText(WORK));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    await screen.findByText(
      "In the areas you picked, which of these matter most to you right now?"
    );
    expect(screen.getByText(DATING)).toBeTruthy();
    expect(screen.getByText(WORK)).toBeTruthy();
    expect(screen.queryByText("Mood & Energy")).toBeNull();
  });

  it("prunes topics when areas change", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: { "16016a": [DATING, WORK], "16016": [STUCK] },
        currentIndex: at("16016a"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await screen.findByText(
      "Beyond sex, which areas would you most like to understand about yourself?"
    );
    await user.click(screen.getByText(WORK)); // unpick the area STUCK sits in
    await waitFor(() => expect(draft().answers["16016"]).toEqual([]));
    expect(draft().answers["16016a"]).toEqual([DATING]);
  });
});

describe("Survey 2.0's details screen", () => {
  const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
  const { yes: YES, no: NO } = optInLabels(OPT_IN.options);
  /** Mark's board 2b: the newsletter switch that opens under the email. */
  const SWITCH = { name: "Keep learning after your report" };
  const COUNTRY = { name: "Which country do you live in?" };
  const onDetails = (answers: Record<string, unknown>) =>
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers,
        currentIndex: at("00010"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
  const next = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: /^next/i }));
  /** The miss-out sheet ignores taps for its first 400 ms. */
  const pastTapGuard = () => new Promise((r) => setTimeout(r, 450));

  it("steps through the fields on Next, the switch under the email, and submits the five answers under today's ids", async () => {
    run.submit.mockClear();
    onDetails({});
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);

    await user.type(await screen.findByLabelText("Name or nickname"), "Sam");
    await next(user);
    await user.type(await screen.findByLabelText("Email"), "sam.private@example.com");
    await user.click(await screen.findByRole("switch", SWITCH));
    await next(user);
    expect(screen.queryByRole("dialog")).toBeNull(); // switched on: no miss-out sheet
    await user.type(await screen.findByRole("combobox", COUNTRY), "Germany");
    await user.click(await screen.findByRole("option", { name: /Germany/ }));
    await user.type(await screen.findByPlaceholderText("e.g. 10115"), "101");
    await next(user);

    await waitFor(() => expect(run.submit).toHaveBeenCalledTimes(1));
    expect(run.submit.mock.calls[0]![0]).toMatchObject({
      "00001": "Sam",
      "00000": "sam.private@example.com",
      "15001": "Germany",
      "15002": "101",
      "16015": YES,
    });
  });

  it("asks 'Sure you want to miss out?' when the email is left with the switch off; Not now opens the country", async () => {
    run.submit.mockClear();
    const { trackSurveyFormError } = await import("@features/analytics/client");
    vi.mocked(trackSurveyFormError).mockClear();
    onDetails({ "00001": "Sam" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await user.type(await screen.findByLabelText("Email"), "sam.private@example.com");
    expect(screen.queryByRole("combobox", COUNTRY)).toBeNull(); // the country opens through Next only
    await next(user);

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/Sure you want to/)).toBeTruthy();
    await pastTapGuard();
    await user.click(within(sheet).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(await screen.findByRole("combobox", COUNTRY)).toBeTruthy();
    await waitFor(() => expect(draft().answers["16015"]).toBe(NO));
    expect(vi.mocked(trackSurveyFormError)).not.toHaveBeenCalled();
    expect(run.submit).not.toHaveBeenCalled();
  });

  it("takes the sheet's Yes as the switch turned on, and opens the country", async () => {
    onDetails({ "00001": "Sam" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await user.type(await screen.findByLabelText("Email"), "sam.private@example.com");
    await next(user);

    const sheet = await screen.findByRole("dialog");
    await pastTapGuard();
    await user.click(within(sheet).getByRole("button", { name: "Yes, I want to keep learning" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(await screen.findByRole("combobox", COUNTRY)).toBeTruthy();
    await waitFor(() => expect(draft().answers["16015"]).toBe(YES));
  });

  it("offers the miss-out sheet once: closed, the next Next opens the country", async () => {
    onDetails({ "00001": "Sam", "00000": "sam.private@example.com" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    expect(await screen.findByRole("switch", SWITCH)).toHaveAttribute("aria-checked", "false");
    await next(user);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("switch", SWITCH)).toBeTruthy(); // still on the email

    await next(user);
    expect(await screen.findByRole("combobox", COUNTRY)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * Survey 2.0's expert question (17004, Mark's board "Q-new-expert"): a Yes opens the phone
 * number one of our experts calls, and Next waits for it (Marcus, 24 Nov).
 */
describe("Survey 2.0's expert question", () => {
  const EXPERT = surveyQuestions.find((q) => q.qId === "17004")!;
  const YES = EXPERT.options[0]!;
  const HEADING = { name: EXPERT.question };
  const onExpert = () =>
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: {},
        currentIndex: at("17004"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
  const yes = () => screen.findByRole("radio", { name: /^Yes, I'd like a free talk/ });

  it("holds Next on a Yes until the number is in, then goes on to the details page", async () => {
    onExpert();
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await user.click(await yes());
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(screen.getByRole("heading", HEADING)).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toMatch(/phone number/);

    await user.type(screen.getByLabelText("Your phone number"), "151 2345678");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(
      await screen.findByRole("heading", { name: /^Last step to your report to become a/ })
    ).toBeTruthy();
    expect(draft().answers).toMatchObject({ "17004": YES, "17004_other": "+49 151 2345678" });
  });

  it("does not auto-advance on a Yes, which still needs the number", async () => {
    localStorage.setItem("loveiq-survey-autoadvance", "true");
    onExpert();
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await user.click(await yes());
    await new Promise((r) => setTimeout(r, 500)); // Auto-advance moves on after 350 ms
    expect(screen.getByRole("heading", HEADING)).toBeTruthy();
    expect(screen.getByLabelText("Your phone number")).toBeTruthy();
  });
});

/**
 * Classic asks the expert's sheet BEFORE 01005 and leaves the reader there to answer it; 2.0
 * shows it AFTER 03012 (Mark's spot), so closing it carries on to the next screen, 08002.
 */
describe("Survey 2.0's expert sheet", () => {
  const onLastBeforeIt = () =>
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: { "03012": 4 },
        currentIndex: at("03012"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
  /** Past the sheet's guard against taps that land as it opens. */
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  const nextScreen = () => screen.findByRole("heading", { name: SCREENS[at("08002")]!.question });

  it("opens after 03012, and Keep going carries on to 08002", async () => {
    onLastBeforeIt();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 sheets={["expert"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /^next/i }));
    const keepGoing = await screen.findByRole("button", { name: "Keep going" });
    await settle();
    fireEvent.click(keepGoing);
    expect(await nextScreen()).toBeTruthy();
  });

  it("carries on to 08002 when closed with Esc too", async () => {
    onLastBeforeIt();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 sheets={["expert"]} />);
    fireEvent.click(await screen.findByRole("button", { name: /^next/i }));
    await screen.findByRole("button", { name: "Keep going" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await nextScreen()).toBeTruthy();
  });
});

describe("Survey 2.0's report map", () => {
  it("opens after 17002 and counts the three screens left", async () => {
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: { "17002": 5 },
        currentIndex: at("17002"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 sheets={["reportMap"]} />);
    await user.click(await screen.findByRole("button", { name: /^next/i }));
    expect(await screen.findByText(/3 questions left/)).toBeTruthy();
  });
});

/**
 * Survey 2.0's own time (Mark's short guide: "It takes about 9 minutes from start to finish"):
 * the progress and the sheets' minutes left tell the same, never the classic survey's 15.
 */
describe("Survey 2.0's time", () => {
  it("shows the guide's 9 minutes on its first screen", async () => {
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: {},
        currentIndex: 0,
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    expect(await screen.findByText("1/62")).toBeTruthy();
    expect(screen.getByText("~9 min")).toBeTruthy();
    expect(screen.queryByText("~15 min")).toBeNull();
  });

  it("counts minutes left from 2.0's total, and the classic survey's from its own", async () => {
    const { minutesLeft } = await import("@features/survey/ui/SurveyProgress");
    const { SURVEY_2_MINUTES } = await import("@features/survey/survey2/order");
    expect(SURVEY_2_MINUTES).toBe(9);
    expect(minutesLeft(0, 62, SURVEY_2_MINUTES)).toBe(9);
    expect(minutesLeft(60, 62, SURVEY_2_MINUTES)).toBe(1);
    expect(minutesLeft(0, 62)).toBe(15);
  });
});

/**
 * Review Focus 4: the server refuses the email (an invalid address) after a 2.0 run's last
 * screen. Fix my email brings the reader back to the details page with the email field open,
 * the rest kept. (The five-minute limit is a 429: the retry screen, as in the classic survey.)
 */
describe("Survey 2.0's details screen after the server refused the email", () => {
  it("returns to the details page on an email refusal, the email field open and the rest kept", async () => {
    const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
    const { no: NO } = optInLabels(OPT_IN.options);
    run.status = "error";
    run.errorKind = "email";
    run.clear.mockClear();
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: {
          "00001": "Sam",
          "00000": "sam@not-an-address",
          "15001": "Germany",
          "15002": "101",
          "16015": NO,
          "17001": 4,
        },
        currentIndex: SCREENS.length, // past the last screen: the submission's outcome
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    try {
      const user = userEvent.setup();
      render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
      await user.click(await screen.findByRole("button", { name: /finish processing/i }));
      await user.click(await screen.findByRole("button", { name: /fix my email/i }));

      expect(await screen.findByText("Where should we send your report?")).toBeTruthy();
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sam@not-an-address");
      expect(screen.getByText("Sam")).toBeTruthy();
      expect(run.clear).toHaveBeenCalled();
    } finally {
      run.status = "idle";
      run.errorKind = null;
    }
  });
});
