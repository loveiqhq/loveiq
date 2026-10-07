// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("@features/survey/ui/questions/ChoiceCard", () => ({
  default: (props: {
    label: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    multi?: boolean;
  }) => (
    <button
      data-testid={`choice-${props.label}`}
      onClick={props.onClick}
      aria-checked={props.selected}
      role={props.multi ? "checkbox" : "radio"}
    >
      <span>{props.label}</span>
      {props.description && (
        <span data-testid={`description-${props.label}`}>{props.description}</span>
      )}
    </button>
  ),
}));

import MultipleChoiceQuestion from "@features/survey/ui/questions/MultipleChoiceQuestion";
import { makeAnswerOptionsExplained, makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";
import { surveyQuestions } from "@/data/survey-data";
import { optionGroupsFor } from "@features/survey/optionGroups";

afterEach(cleanup);

const baseQuestion = makeSurveyQuestion({
  qId: "q1",
  question: "Pick your favorites",
  answerType: "multiple",
  options: ["A", "B", "C", "D", "Other"],
  answerOptionsExplained: makeAnswerOptionsExplained([
    ["A", "Explanation for A"],
    ["B", "Explanation for B"],
    ["C", "Explanation for C"],
  ]),
  required: false,
});

function ControlledQuestion({
  question = baseQuestion,
  initialValue = [],
}: {
  question?: SurveyQuestion;
  initialValue?: string[];
}) {
  const [value, setValue] = useState<string[]>(initialValue);
  return <MultipleChoiceQuestion question={question} value={value} onChange={setValue} />;
}

describe("MultipleChoiceQuestion", () => {
  it("renders all options", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("choice-A")).toBeInTheDocument();
    expect(screen.getByTestId("choice-B")).toBeInTheDocument();
    expect(screen.getByTestId("choice-C")).toBeInTheDocument();
    expect(screen.getByTestId("choice-Other")).toBeInTheDocument();
  });

  it("renders question text and renders formatGuidance subtitle when supplied", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Pick your favorites")).toBeInTheDocument();
    // The previous "Select all that apply" JS fallback was removed; subtitle
    // now renders only from question.formatGuidance.
    expect(screen.queryByText(/select all that apply/i)).not.toBeInTheDocument();

    cleanup();
    render(
      <MultipleChoiceQuestion
        question={{ ...baseQuestion, formatGuidance: "Select all that apply." }}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Select all that apply.")).toBeInTheDocument();
  });

  it("does not render descriptions for unselected explained options", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId("description-A")).not.toBeInTheDocument();
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
    expect(screen.queryByTestId("description-C")).not.toBeInTheDocument();
  });

  it("renders descriptions for selected explained options", () => {
    render(
      <MultipleChoiceQuestion question={baseQuestion} value={["A", "C"]} onChange={vi.fn()} />
    );

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
    expect(screen.getByTestId("description-C")).toHaveTextContent("Explanation for C");
  });

  it("does not render description UI for options without explanations", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={["Other"]} onChange={vi.fn()} />);
    expect(screen.queryByTestId("description-Other")).not.toBeInTheDocument();
  });

  it("shows an option description after selecting it", async () => {
    const user = userEvent.setup();
    render(<ControlledQuestion />);

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
  });

  it("hides an option description after deselecting it", async () => {
    const user = userEvent.setup();
    render(<ControlledQuestion initialValue={["A"]} />);

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.queryByTestId("description-A")).not.toBeInTheDocument();
  });

  it("clicking adds to selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={baseQuestion} value={[]} onChange={onChange} />);

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });

  it("clicking selected item removes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleChoiceQuestion question={baseQuestion} value={["A", "B"]} onChange={onChange} />
    );

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });

  it("handles null value gracefully", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("coerces stale string values into a selectable array", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={"A" as unknown as string[] | null}
        onChange={onChange}
      />
    );

    await user.click(screen.getByTestId("choice-B"));
    expect(onChange).toHaveBeenCalledWith(["A", "B"]);
  });

  it("shows text input when Other is selected", () => {
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Please specify…")).toBeInTheDocument();
  });

  it("does not show text input when Other is not selected", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={["A"]} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Please specify…")).not.toBeInTheDocument();
  });

  it("text input calls onOtherTextChange", async () => {
    const user = userEvent.setup();
    const onOtherTextChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={onOtherTextChange}
      />
    );

    await user.type(screen.getByPlaceholderText("Please specify…"), "x");
    expect(onOtherTextChange).toHaveBeenCalledWith("x");
  });

  it("blocks selecting more than the configured max", async () => {
    const user = userEvent.setup();
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(<ControlledQuestion question={cappedQuestion} initialValue={["A", "B", "C"]} />);

    await user.click(screen.getByTestId("choice-D"));

    expect(screen.getByRole("alert")).toHaveTextContent(/up to 3 options/i);
    expect(screen.getByTestId("choice-D")).toHaveAttribute("aria-checked", "false");
  });

  it("allows deselecting after the limit is reached", async () => {
    const user = userEvent.setup();
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(<ControlledQuestion question={cappedQuestion} initialValue={["A", "B", "C"]} />);

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("choice-A")).toHaveAttribute("aria-checked", "false");
  });

  it("shows limit guidance when forced validation finds an over-limit persisted state", () => {
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(
      <MultipleChoiceQuestion
        question={cappedQuestion}
        value={["A", "B", "C", "D"]}
        onChange={vi.fn()}
        forceValidation
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/up to 3 options/i);
  });

  describe("None of these", () => {
    const withNone = makeSurveyQuestion({
      qId: "q2",
      answerType: "multiple",
      options: ["Therapy", "Books", "An app", "None of these"],
      required: true,
    });
    const checked = (label: string) =>
      screen.getByTestId(`choice-${label}`).getAttribute("aria-checked") === "true";

    // Picking it beside a real answer stored a contradiction.
    it("clears the other picks", async () => {
      const user = userEvent.setup();
      render(<ControlledQuestion question={withNone} initialValue={["Therapy", "Books"]} />);
      await user.click(screen.getByTestId("choice-None of these"));
      expect(checked("None of these")).toBe(true);
      expect(checked("Therapy")).toBe(false);
      expect(checked("Books")).toBe(false);
    });

    it("is cleared by a real pick", async () => {
      const user = userEvent.setup();
      render(<ControlledQuestion question={withNone} initialValue={["None of these"]} />);
      await user.click(screen.getByTestId("choice-Books"));
      expect(checked("Books")).toBe(true);
      expect(checked("None of these")).toBe(false);
    });
  });

  describe("a list of one", () => {
    const one = makeSurveyQuestion({
      qId: "q3",
      answerType: "multiple",
      options: ["Time", "Money", "Nothing major is in the way right now"],
      maxSelections: 1,
    });

    // The work order (C7) keeps the cap with its explanation; it read "up to 1 options".
    it("keeps the first pick and explains the cap in the singular", async () => {
      const user = userEvent.setup();
      render(<ControlledQuestion question={one} initialValue={["Time"]} />);
      await user.click(screen.getByTestId("choice-Money"));
      expect(screen.getByTestId("choice-Time").getAttribute("aria-checked")).toBe("true");
      expect(screen.getByTestId("choice-Money").getAttribute("aria-checked")).toBe("false");
      expect(screen.getByRole("alert")).toHaveTextContent("You can select up to 1 option.");
      expect(screen.getByRole("alert")).not.toHaveTextContent("1 options");
    });
  });
});

describe("MultipleChoiceQuestion — grouped into categories (C9)", () => {
  const c9 = surveyQuestions.find((q) => q.qId === "16016")!;
  const groups = optionGroupsFor(c9)!;
  const topicsOf = (label: string) => [...groups.find((g) => g.label === label)!.options];
  const header = (label: string) =>
    screen.getByRole("button", { name: new RegExp(`^${label.replace(/[&,]/g, ".")}`) });

  function ControlledC9({
    initialValue = [],
    onChangeSpy,
  }: {
    initialValue?: string[];
    onChangeSpy?: (value: string[]) => void;
  }) {
    const [value, setValue] = useState<string[]>(initialValue);
    return (
      <MultipleChoiceQuestion
        question={c9}
        value={value}
        onChange={(next) => {
          onChangeSpy?.(next);
          setValue(next);
        }}
      />
    );
  }

  it("shows the thirteen categories as closed dropdowns and no topic until one is opened", () => {
    render(<MultipleChoiceQuestion question={c9} value={[]} onChange={vi.fn()} />);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(13);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("opening a category shows exactly that category's topics", async () => {
    const user = userEvent.setup();
    render(<ControlledC9 />);

    await user.click(header("Sleep & Body"));

    expect(header("Sleep & Body")).toHaveAttribute("aria-expanded", "true");
    const shown = screen.getAllByRole("checkbox").map((el) => el.textContent);
    expect(shown.sort()).toEqual(topicsOf("Sleep & Body").sort());
  });

  it("keeps one category open at a time, and closes it again on a second click", async () => {
    const user = userEvent.setup();
    render(<ControlledC9 />);

    await user.click(header("Sleep & Body"));
    await user.click(header("Work, Purpose & Money"));

    expect(header("Sleep & Body")).toHaveAttribute("aria-expanded", "false");
    expect(
      screen
        .getAllByRole("checkbox")
        .map((el) => el.textContent)
        .sort()
    ).toEqual(topicsOf("Work, Purpose & Money").sort());

    await user.click(header("Work, Purpose & Money"));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("tells a collapsed category how many of its topics are picked", () => {
    render(
      <MultipleChoiceQuestion
        question={c9}
        value={["Poor or broken sleep", "Money worries", "Money conflict with a partner"]}
        onChange={vi.fn()}
      />
    );
    expect(header("Sleep & Body")).toHaveTextContent("1 selected");
    expect(header("Work, Purpose & Money")).toHaveTextContent("2 selected");
    expect(header("Mood & Energy")).not.toHaveTextContent(/selected/);
  });

  it("appends picks in click order across categories", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<ControlledC9 onChangeSpy={onChangeSpy} />);

    await user.click(header("Work, Purpose & Money"));
    await user.click(screen.getByRole("checkbox", { name: "Money worries" }));
    await user.click(header("Sleep & Body"));
    await user.click(screen.getByRole("checkbox", { name: "Poor or broken sleep" }));

    expect(onChangeSpy).toHaveBeenLastCalledWith(["Money worries", "Poor or broken sleep"]);
  });

  it("still refuses a fourth pick when the three already chosen sit in other categories", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(
      <ControlledC9
        initialValue={["Poor or broken sleep", "Money worries", "Grief & loss"]}
        onChangeSpy={onChangeSpy}
      />
    );

    await user.click(header("Mood & Energy"));
    const fourth = screen.getByRole("checkbox", { name: "Low energy & motivation" });
    await user.click(fourth);

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(fourth).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(/up to 3 options/i);
  });

  it("keeps Enter on a category header away from the survey's Enter-for-Next shortcut", () => {
    // SurveyEngine listens for Enter on window and moves to the next question. Opening a
    // category from the keyboard must not also skip the question.
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<MultipleChoiceQuestion question={c9} value={["Money worries"]} onChange={vi.fn()} />);
      fireEvent.keyDown(header("Sleep & Body"), { key: "Enter" });
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  // Mark, 2026-10-06: on a phone the list seemed to end where the footer began.
  describe("categories under the sticky footer", () => {
    const scrollY = { value: 0 };
    const footerTop = { value: 500 };
    let footer: HTMLDivElement;
    let rect: ReturnType<typeof vi.spyOn>;
    let scrolled: ReturnType<typeof vi.fn>;
    // Headings 52px tall every 60px from 100px: with the footer at 500px, the seventh
    // (index 6, 460-512) is the first not fully above it, so seven are under it.
    const headingIndex = (el: Element) =>
      Number(/-group-(\d+)$/.exec(el.getAttribute("aria-controls") ?? "")?.[1] ?? NaN);

    beforeEach(() => {
      footer = document.createElement("div");
      footer.setAttribute("data-survey-footer", "");
      document.body.appendChild(footer);
      rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
        this: Element
      ) {
        const top = this.hasAttribute("data-survey-footer")
          ? footerTop.value
          : 100 + 60 * headingIndex(this) - scrollY.value;
        return Number.isNaN(top)
          ? new DOMRect(0, 0, 0, 0)
          : new DOMRect(0, top, 300, this === footer ? 160 : 52);
      });
      scrolled = vi.fn();
      Element.prototype.scrollIntoView = scrolled;
    });

    afterEach(() => {
      rect.mockRestore();
      footer.remove();
      scrollY.value = 0;
      footerTop.value = 500;
    });

    it("says how many categories are under it, and a tap brings the next one up", async () => {
      const user = userEvent.setup();
      render(<ControlledC9 />);

      const pill = screen.getByText("7 more categories");
      await user.click(pill);

      expect(scrolled).toHaveBeenCalledTimes(1);
      expect(headingIndex(scrolled.mock.contexts[0] as Element)).toBe(6);
    });

    it("counts down as the reader scrolls, and goes away at the last category", () => {
      render(<ControlledC9 />);
      expect(screen.getByText("7 more categories")).toBeInTheDocument();

      scrollY.value = 300;
      fireEvent.scroll(window);
      expect(screen.getByText("2 more categories")).toBeInTheDocument();

      scrollY.value = 400;
      fireEvent.scroll(window);

      expect(screen.queryByText(/more categor/)).toBeNull();
    });

    // The question slides in: a count read mid-animation was off by a heading on an iPhone 13.
    it("counts again when the question has finished sliding in", () => {
      scrollY.value = -60; // still sliding: everything a heading lower
      render(<ControlledC9 />);
      expect(screen.getByText("8 more categories")).toBeInTheDocument();

      scrollY.value = 0;
      fireEvent.animationEnd(window);

      expect(screen.getByText("7 more categories")).toBeInTheDocument();
    });

    it("sits on the footer's top edge, or clear of the screen's bottom when the footer is not pinned", () => {
      render(<ControlledC9 />);
      const pill = screen.getByText("7 more categories");
      expect(pill.style.bottom).toBe(`${window.innerHeight - 500}px`);
      expect(pill).toHaveClass("translate-y-1/2");

      footerTop.value = window.innerHeight + 200; // a short window: the footer follows the list
      fireEvent.scroll(window);

      expect(pill.style.bottom).toBe("12px");
      expect(pill).not.toHaveClass("translate-y-1/2");
    });
  });

  it("labels each open panel as a group named after its category", async () => {
    const user = userEvent.setup();
    render(<ControlledC9 />);
    await user.click(header("Intimacy & Desire"));
    const panel = screen.getByRole("group", { name: "Intimacy & Desire" });
    expect(
      within(panel)
        .getAllByRole("checkbox")
        .map((el) => el.textContent)
        .sort()
    ).toEqual(topicsOf("Intimacy & Desire").sort());
  });
});
