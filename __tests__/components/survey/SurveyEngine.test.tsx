// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// --- Mutable mock state ---

const mockSetAnswer = vi.fn();
const mockGetAnswer = vi.fn().mockReturnValue(null);
const mockSetCurrentIndex = vi.fn();
const mockTrackNavigation = vi.fn();
const mockSubmit = vi.fn();

let mockCurrentIndex = 0;
let mockProgress = 0;
let mockSubmitStatus: string = "idle";

vi.mock("@/components/survey/hooks/useSurveyState", () => ({
  useSurveyState: () => ({
    answers: {},
    get currentIndex() {
      return mockCurrentIndex;
    },
    startedAt: new Date().toISOString(),
    get progress() {
      return mockProgress;
    },
    setAnswer: mockSetAnswer,
    getAnswer: mockGetAnswer,
    setCurrentIndex: mockSetCurrentIndex,
    clearState: vi.fn(),
  }),
}));

vi.mock("@/components/survey/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: mockSubmit,
    get status() {
      return mockSubmitStatus;
    },
  }),
}));

vi.mock("@/components/survey/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: mockTrackNavigation }),
}));

vi.mock("@/data/survey-data", () => ({
  surveyQuestions: [
    {
      qId: "q1",
      cId: 1,
      question: "Q1?",
      answerType: "single",
      options: ["A", "B"],
      chapter: "ch1",
      required: true,
      guide: "",
    },
    {
      qId: "q2",
      cId: 1,
      question: "Q2?",
      answerType: "scale",
      chapter: "ch1",
      required: false,
      options: [],
      guide: "",
      scaleLabels: { low: "Low", high: "High" },
    },
    {
      qId: "q3",
      cId: 2,
      question: "Q3?",
      answerType: "open",
      chapter: "ch2",
      required: false,
      options: [],
      guide: "",
    },
  ],
  chapterIntros: [],
}));

vi.mock("@/lib/analytics", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyPause: vi.fn(),
}));

vi.mock("@/components/survey/questions/SingleChoiceQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="single-choice">{props.question.question}</div>
  ),
}));
vi.mock("@/components/survey/questions/ScaleQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="scale-question">{props.question.question}</div>
  ),
}));
vi.mock("@/components/survey/questions/OpenResponseQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="open-response">{props.question.question}</div>
  ),
}));
vi.mock("@/components/survey/questions/MultipleChoiceQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="multiple-choice">{props.question.question}</div>
  ),
}));
vi.mock("@/components/survey/questions/CountryQuestion", () => ({
  default: (props: { question: { question: string } }) => (
    <div data-testid="country-question">{props.question.question}</div>
  ),
}));

vi.mock("@/components/survey/SurveyHeader", () => ({
  default: () => <div data-testid="survey-header" />,
}));
vi.mock("@/components/survey/SurveyNav", () => ({
  default: () => <div data-testid="survey-nav" />,
}));
vi.mock("@/components/survey/GuideAvatar", () => ({
  default: () => <div data-testid="guide-avatar" />,
}));
vi.mock("@/components/survey/GuidancePanel", () => ({
  default: () => <div data-testid="guidance-panel" />,
}));
vi.mock("@/components/survey/PreReportWizard", () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="pre-report-wizard">
      <button onClick={onComplete}>Complete Wizard</button>
    </div>
  ),
}));
vi.mock("@/components/survey/ProcessingSequence", () => ({
  default: ({ onComplete }: { onComplete: () => void; submitDone: boolean }) => (
    <div data-testid="processing-sequence">
      <span>Extracting your answers...</span>
      <button onClick={onComplete}>Finish Processing</button>
    </div>
  ),
}));

import SurveyEngine from "@/components/survey/SurveyEngine";

beforeEach(() => {
  vi.useFakeTimers();
  mockCurrentIndex = 0;
  mockProgress = 0;
  mockSubmitStatus = "idle";
  mockSetAnswer.mockClear();
  mockGetAnswer.mockClear().mockReturnValue(null);
  mockSetCurrentIndex.mockClear();
  mockTrackNavigation.mockClear();
  mockSubmit.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SurveyEngine", () => {
  it("renders first question on mount", () => {
    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("single-choice")).toBeInTheDocument();
    expect(screen.getByText("Q1?")).toBeInTheDocument();
  });

  it("renders the correct question component for answerType single", () => {
    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("single-choice")).toBeInTheDocument();
    expect(screen.queryByTestId("scale-question")).not.toBeInTheDocument();
    expect(screen.queryByTestId("open-response")).not.toBeInTheDocument();
  });

  it("shows processing sequence when currentIndex >= total questions", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;

    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.getByText("Extracting your answers...")).toBeInTheDocument();
  });

  it("calls onExit when Return to LoveIQ button clicked on final confirmation screen", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;

    const onExit = vi.fn();
    mockSubmitStatus = "success";
    render(<SurveyEngine onExit={onExit} />);

    // Complete processing → wizard
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    // Complete wizard → done
    fireEvent.click(screen.getByRole("button", { name: /complete wizard/i }));

    fireEvent.click(screen.getByRole("button", { name: /return to loveiq/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("renders scale question component for answerType scale", () => {
    mockCurrentIndex = 1;

    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("scale-question")).toBeInTheDocument();
    expect(screen.getByText("Q2?")).toBeInTheDocument();
  });

  it("renders open response question component for answerType open", () => {
    mockCurrentIndex = 2;

    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("open-response")).toBeInTheDocument();
    expect(screen.getByText("Q3?")).toBeInTheDocument();
  });

  it("shows survey header and nav when in question view", () => {
    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByTestId("survey-header")).toBeInTheDocument();
    expect(screen.getByTestId("survey-nav")).toBeInTheDocument();
  });
});

describe("SurveyEngine — completion phases", () => {
  it("transitions from processing to pre-report wizard on success", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;
    mockSubmitStatus = "success";

    render(<SurveyEngine onExit={vi.fn()} />);

    // Initially shows processing sequence
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-report-wizard")).not.toBeInTheDocument();

    // Complete processing
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    // Now shows wizard
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("processing-sequence")).not.toBeInTheDocument();
  });

  it("shows final confirmation after wizard completes", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;
    mockSubmitStatus = "success";

    render(<SurveyEngine onExit={vi.fn()} />);

    // Complete processing → wizard
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(screen.getByTestId("pre-report-wizard")).toBeInTheDocument();

    // Complete the wizard
    fireEvent.click(screen.getByRole("button", { name: /complete wizard/i }));

    // Back to confirmation (done phase)
    expect(screen.getByText("Your Journey Begins")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-report-wizard")).not.toBeInTheDocument();
  });

  it("skips wizard and shows error confirmation on error", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;
    mockSubmitStatus = "error";

    render(<SurveyEngine onExit={vi.fn()} />);

    // Initially shows processing
    expect(screen.getByTestId("processing-sequence")).toBeInTheDocument();

    // Complete processing (error path skips wizard)
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));

    // Shows error confirmation directly, no wizard
    expect(screen.getByText("Answers Saved Locally")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-report-wizard")).not.toBeInTheDocument();
  });
});
