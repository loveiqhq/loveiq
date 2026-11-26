// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import QuestionHeading from "@features/survey/ui/questions/QuestionHeading";
import SingleChoiceQuestion from "@features/survey/ui/questions/SingleChoiceQuestion";

/**
 * Survey 2.0's expert question (17004) as Mark's board "Q-new-expert" draws it: a "Free" tag on
 * the Yes, and under a picked Yes the phone number one of our experts calls (Marcus, 24 Nov).
 */
afterEach(cleanup);

const EXPERT = surveyQuestions.find((q) => q.qId === "17004")!;
const YES = "Yes, I'd like a free talk with an expert";
const NO = "No, thanks";
const yesOption = () => screen.getByRole("radio", { name: /^Yes, I'd like a free talk/ });

/** The screen as the engine holds it: the answer and the phone box's text kept in state. */
function setup(initial: { value?: string; phone?: string; forceValidation?: boolean } = {}) {
  const onChange = vi.fn();
  const onPhone = vi.fn();
  function Screen() {
    const [value, setValue] = useState<string | null>(initial.value ?? null);
    const [phone, setPhone] = useState(initial.phone ?? "");
    return (
      <SingleChoiceQuestion
        question={EXPERT}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        otherText={phone}
        onOtherTextChange={(t) => {
          onPhone(t);
          setPhone(t);
        }}
        forceValidation={initial.forceValidation}
      />
    );
  }
  render(<Screen />);
  return { onChange, onPhone };
}

describe("the expert question's screen", () => {
  it("tags the Yes as free", () => {
    setup();
    expect(within(yesOption()).getByText("Free")).toBeTruthy();
    expect(within(screen.getByRole("radio", { name: NO })).queryByText("Free")).toBeNull();
  });

  it("asks for the phone number only once Yes is picked, Germany's code first", async () => {
    setup();
    expect(screen.queryByLabelText("Your phone number")).toBeNull();
    await userEvent.click(yesOption());
    expect(screen.getByLabelText("Your phone number")).toBeTruthy();
    const code = screen.getByRole("combobox", { name: "Country code" }) as HTMLSelectElement;
    expect(code.value).toBe("+49");
    expect(
      screen.getByText("So one of our experts can call you to set up your free talk.")
    ).toBeTruthy();
  });

  it("stores the country code and the number together", async () => {
    const { onPhone } = setup({ value: YES });
    await userEvent.type(screen.getByLabelText("Your phone number"), "151 23");
    expect(onPhone).toHaveBeenLastCalledWith("+49 151 23");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country code" }), "+43");
    expect(onPhone).toHaveBeenLastCalledWith("+43 151 23");
  });

  it("says what is missing when Next is pressed without a full number", () => {
    setup({ value: YES, phone: "+49 123", forceValidation: true });
    expect(screen.getByRole("alert").textContent).toBe(
      "Add your phone number so an expert can call you."
    );
  });

  it("keeps the number out of session recordings", () => {
    setup({ value: YES });
    const input = screen.getByLabelText("Your phone number");
    expect(input.getAttribute("data-clarity-mask")).toBe("true");
    expect(input.className).toContain("ph-no-capture");
  });

  it("drops a typed number when another answer is picked", async () => {
    const { onPhone } = setup({ value: YES, phone: "+49 1512345678" });
    await userEvent.click(screen.getByRole("radio", { name: NO }));
    expect(screen.queryByLabelText("Your phone number")).toBeNull();
    expect(onPhone).toHaveBeenLastCalledWith("");
  });
});

describe("the expert question's heading", () => {
  it("opens the helper with a bold “It's free.”", () => {
    render(<QuestionHeading question={EXPERT} />);
    expect(screen.getByText("It's free.").tagName).toBe("STRONG");
    expect(
      screen.getByText(/Our trained coaches and therapists can help you understand your results/)
    ).toBeTruthy();
  });
});
