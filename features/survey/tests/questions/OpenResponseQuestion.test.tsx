// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import OpenResponseQuestion from "@features/survey/ui/questions/OpenResponseQuestion";
import { makeOpenQuestion } from "@/__tests__/__fixtures__/survey";
import type { SurveyQuestion } from "@/data/survey-data";

afterEach(cleanup);

const baseQuestion = makeOpenQuestion({
  qId: "q1",
  question: "What is your name?",
  required: true,
});

describe("OpenResponseQuestion", () => {
  it("renders question text", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("What is your name?")).toBeInTheDocument();
  });

  it("renders text input with placeholder", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Type your answer…")).toBeInTheDocument();
  });

  it("stops the name at the 80 characters the server keeps", () => {
    // Over 80 used to be refused at the final submit, 56 questions later, on every Retry.
    const name = makeOpenQuestion({ qId: "00001", question: "What is your name?" });
    render(<OpenResponseQuestion question={name} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "80");
  });

  it("flags an email the server would refuse, at the question", () => {
    const email = makeOpenQuestion({ qId: "00000", question: "Email?", inputType: "email" });
    render(
      <OpenResponseQuestion
        question={email}
        value="na..me@gmail.com"
        onChange={vi.fn()}
        forceValidation
      />
    );
    expect(screen.getByText(/doesn.t look like a valid email/i)).toBeInTheDocument();
  });

  it("uses custom placeholder when provided", () => {
    const q = { ...baseQuestion, placeholder: "Enter your email" };
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OpenResponseQuestion question={baseQuestion} value="" onChange={onChange} />);

    await user.type(screen.getByPlaceholderText("Type your answer…"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders email input when inputType is email", () => {
    const q = { ...baseQuestion, inputType: "email" } as SurveyQuestion;
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Type your answer…");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("shows character counter", () => {
    render(<OpenResponseQuestion question={baseQuestion} value="hello" onChange={vi.fn()} />);
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("renders no subtitle when formatGuidance is absent", () => {
    // The previous "Please enter your email address" JS fallback was removed
    // because the canonical xlsx source supplies the subtitle via the
    // Answer-format-guidance column, not via JS defaults.
    const q = { ...baseQuestion, inputType: "email" } as SurveyQuestion;
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText("Please enter your email address")).not.toBeInTheDocument();
  });

  it("shows formatGuidance as subtitle when provided", () => {
    const q = { ...baseQuestion, formatGuidance: "Enter a valid email address." };
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("displays current value in input", () => {
    render(
      <OpenResponseQuestion question={baseQuestion} value="Current answer" onChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue("Current answer")).toBeInTheDocument();
  });
});

describe("OpenResponseQuestion — multi-line content asks (16019, 16020)", () => {
  const insights = makeOpenQuestion({
    qId: "16019",
    question: "Was there a learning or insight that profoundly changed or improved your sexuality?",
    required: false,
    placeholder: "Think of something you wish you had understood about your sexuality earlier",
  });

  function ControlledInsights() {
    const [value, setValue] = useState("");
    return <OpenResponseQuestion question={insights} value={value} onChange={setValue} />;
  }

  it("answers in a multi-line box rather than a single line", () => {
    render(<OpenResponseQuestion question={insights} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("shows the question's own hint as the grey placeholder in the box", () => {
    render(<OpenResponseQuestion question={insights} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Think of something you wish you had understood about your sexuality earlier"
    );
  });

  it("allows 1,000 characters, the server's cap, and counts them", () => {
    render(<OpenResponseQuestion question={insights} value="hello" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "1000");
    expect(screen.getByText("5 / 1000")).toBeInTheDocument();
  });

  it("keeps what people type out of session replay", () => {
    // The survey root is deliberately unmasked (owner decision, 10.08), so without this
    // Clarity would record the free text itself. Fatih, 29.09: mask these two boxes only.
    render(<OpenResponseQuestion question={insights} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("data-clarity-mask", "true");
  });

  it("lets Enter start a new line", async () => {
    const user = userEvent.setup();
    render(<ControlledInsights />);
    await user.type(screen.getByRole("textbox"), "one{Enter}two");
    expect(screen.getByRole("textbox")).toHaveValue("one\ntwo");
  });

  it("keeps Enter and the arrow keys away from the survey's Next and Back shortcuts", () => {
    // SurveyEngine listens on window: Enter or → moves on, ← goes back. Inside a box
    // those are editing keys.
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<OpenResponseQuestion question={insights} value="text" onChange={vi.fn()} />);
      const box = screen.getByRole("textbox");
      for (const key of ["Enter", "ArrowLeft", "ArrowRight"]) fireEvent.keyDown(box, { key });
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("leaves single-line questions exactly as they were", () => {
    render(<OpenResponseQuestion question={baseQuestion} value="hello" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox").tagName).toBe("INPUT");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("data-clarity-mask");
  });
});

/**
 * The confirm box, when it is the only thing missing.
 *
 * Next stays disabled until the two boxes match, and a disabled button takes no
 * tap, so an EMPTY confirm box used to block Next with nothing on screen saying
 * why: no error fires until the box holds something. Reproduced on iPhone and
 * Android emulation on 2026-10-04.
 */
describe("OpenResponseQuestion: the empty confirm box", () => {
  const email = { ...baseQuestion, qId: "00000", inputType: "email" } as SurveyQuestion;
  const PROMPT = "Type your email again to confirm it.";
  const renderEmail = (value: string, confirmValue: string, forceValidation = false) =>
    render(
      <OpenResponseQuestion
        question={email}
        value={value}
        onChange={vi.fn()}
        confirmValue={confirmValue}
        onConfirmChange={vi.fn()}
        forceValidation={forceValidation}
      />
    );

  it("says so as soon as a valid email is in and the confirm box is empty", () => {
    renderEmail("jane@example.com", "");
    const prompt = screen.getByText(PROMPT);
    // A hint before they have tried to go on, not an error.
    expect(prompt.className).not.toContain("text-[#ef4444]");
  });

  it("turns red once they try to go on", () => {
    renderEmail("jane@example.com", "", true);
    expect(screen.getByText(PROMPT).className).toContain("text-[#ef4444]");
  });

  it("goes once the confirm box holds anything", () => {
    renderEmail("jane@example.com", "jane@example.com");
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    cleanup();
    // A different address is the mismatch error's job, not this prompt's.
    renderEmail("jane@example.com", "jan@example.com", true);
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    expect(screen.getByText(/Emails don.t match/)).toBeInTheDocument();
  });

  it("waits for a valid email first, which has its own message", () => {
    renderEmail("jane@", "");
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    cleanup();
    renderEmail("", "");
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it("is tied to the confirm box for screen readers, and marks it invalid once red", () => {
    renderEmail("jane@example.com", "");
    let confirm = screen.getByRole("textbox", { name: "Confirm email address" });
    const describedBy = confirm.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(PROMPT);
    // A hint is not an error.
    expect(confirm).not.toHaveAttribute("aria-invalid");
    cleanup();

    renderEmail("jane@example.com", "", true);
    confirm = screen.getByRole("textbox", { name: "Confirm email address" });
    expect(confirm).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(confirm.getAttribute("aria-describedby")!)).toHaveTextContent(
      PROMPT
    );
    cleanup();

    // Nothing to say, nothing referenced.
    renderEmail("jane@example.com", "jane@example.com", true);
    confirm = screen.getByRole("textbox", { name: "Confirm email address" });
    expect(confirm).not.toHaveAttribute("aria-describedby");
    expect(confirm).not.toHaveAttribute("aria-invalid");
  });

  it("is only ever on the email question", () => {
    render(
      <OpenResponseQuestion
        question={baseQuestion}
        value="jane@example.com"
        onChange={vi.fn()}
        confirmValue=""
      />
    );
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });
});

/**
 * The email question test's anonymous arm, Figma IdxyUUVvJSYRTpI9CYRtJI 11600:15119:
 * one underline input, no confirm box. The copy reaches this component already swapped
 * (`applyEmailQuestionArm`); what changes here is the field itself.
 */
describe("OpenResponseQuestion: the anonymous email arm", () => {
  const email = makeOpenQuestion({
    qId: "00000",
    question: "What’s your email? Feel free to use an anonymous one.",
    inputType: "email",
    placeholder: "e.g. nickname@example.com",
  });
  const renderAnonymous = (value: string, forceValidation = false) =>
    render(
      <OpenResponseQuestion
        question={email}
        value={value}
        onChange={vi.fn()}
        confirmValue=""
        onConfirmChange={vi.fn()}
        forceValidation={forceValidation}
        emailArm="anonymous"
      />
    );

  it("asks for the address once, with no confirm box", () => {
    renderAnonymous("");
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute("type", "email");
    expect(boxes[0]).toHaveAttribute("placeholder", "e.g. nickname@example.com");
    expect(screen.queryByLabelText("Confirm email address")).not.toBeInTheDocument();
    expect(screen.queryByText("Type your email again to confirm it.")).not.toBeInTheDocument();
  });

  it("is named by the question it answers", () => {
    renderAnonymous("");
    expect(
      screen.getByRole("textbox", {
        name: "What’s your email? Feel free to use an anonymous one.",
      })
    ).toBeInTheDocument();
  });

  it("draws the frame's underline field", () => {
    renderAnonymous("");
    const box = screen.getByRole("textbox");
    // 523.5 x 48 from 640px (the full column on a phone), a 1.454px line at
    // rgba(59,59,59,.264), Manrope Light 17.45/23.84 placeholder at 54%. The line is an
    // inset shadow, because browsers draw a 1.454px border 1px thick; under forced
    // colours, which drop shadows, a border takes its place.
    for (const cls of [
      "w-full",
      "sm:w-[523.5px]",
      "h-[48px]",
      "shadow-[inset_0_-1.454px_0_0_rgba(59,59,59,0.264)]",
      "forced-colors:border-b-[1.454px]",
      "font-light",
      "text-[17.45px]",
      "leading-[23.84px]",
      "placeholder:text-[rgba(52,52,52,0.54)]",
    ]) {
      expect(box.className, cls).toContain(cls);
    }
  });

  it("never runs wider than its column", () => {
    // From 640px to about 660px (a classic scrollbar included) the column is narrower
    // than 523.5px, and the line ran past the title by up to ~20px.
    renderAnonymous("");
    expect(screen.getByRole("textbox").className).toContain("max-w-full");
  });

  it("adds no gap under the field until there is something to say", () => {
    // The frame puts the Why row 20px under the line; an always-on 8px gap would make it 28.
    renderAnonymous("");
    expect(screen.getByRole("textbox").parentElement?.className).not.toContain("gap-");
  });

  it("still says when the address is not one the server would take", () => {
    renderAnonymous("na..me@gmail.com", true);
    expect(screen.getByText(/doesn.t look like a valid email/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox").className).toContain(
      "shadow-[inset_0_-1.454px_0_0_#ef4444]"
    );
  });

  it("keeps today's two boxes in the control arm", () => {
    render(
      <OpenResponseQuestion
        question={email}
        value=""
        onChange={vi.fn()}
        confirmValue=""
        onConfirmChange={vi.fn()}
        emailArm="control"
      />
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByLabelText("Confirm email address")).toBeInTheDocument();
  });
});
