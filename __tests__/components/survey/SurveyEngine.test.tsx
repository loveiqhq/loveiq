// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import SurveyEngine from "@/components/survey/SurveyEngine";

beforeEach(() => {
  mockCurrentIndex = 0;
  mockProgress = 0;
  mockSubmitStatus = "idle";
  mockSetAnswer.mockClear();
  mockGetAnswer.mockClear().mockReturnValue(null);
  mockSetCurrentIndex.mockClear();
  mockTrackNavigation.mockClear();
  mockSubmit.mockClear();
});

afterEach(cleanup);

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

  it("shows completion screen when currentIndex >= total questions", () => {
    mockCurrentIndex = 3;
    mockProgress = 100;

    render(<SurveyEngine onExit={vi.fn()} />);
    expect(screen.getByText("Processing Your Answers…")).toBeInTheDocument();
  });

  it("calls onExit when Return to LoveIQ button clicked on completion screen", async () => {
    mockCurrentIndex = 3;
    mockProgress = 100;

    const user = userEvent.setup();
    const onExit = vi.fn();
    mockSubmitStatus = "success";
    render(<SurveyEngine onExit={onExit} />);

    await user.click(screen.getByRole("button", { name: /return to loveiq/i }));
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
