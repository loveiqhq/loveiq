import { describe, expect, it } from "vitest";
import { applyEmailQuestionArm } from "@features/survey/anonymousEmail";
import { surveyQuestions } from "@/data/survey-data";

const email = surveyQuestions.find((q) => q.qId === "00000")!;
const name = surveyQuestions.find((q) => q.qId === "00001")!;

/** Marcus's redesign of the email question, Figma IdxyUUVvJSYRTpI9CYRtJI 11600:15119. */
describe("applyEmailQuestionArm", () => {
  it("gives the email question the anonymous arm's copy, word for word", () => {
    const q = applyEmailQuestionArm(email, "anonymous");
    expect(q.question).toBe("What’s your email? Feel free to use an anonymous one.");
    const guide =
      "Use an inbox you actually check. If you prefer more privacy, choose an anonymous " +
      "email address that isn’t linked to your personal information. You may also " +
      "want to use a private address rather than a work or shared inbox.";
    expect(q.guide).toBe(guide);
    expect(q.supportAndGuidance).toBe(guide);
    // The frame reads "e.g.nickname@example.com"; the missing space is added (Fatih, 07.10).
    expect(q.placeholder).toBe("e.g. nickname@example.com");
  });

  it("keeps the rest of the question as it is", () => {
    const q = applyEmailQuestionArm(email, "anonymous");
    expect(q.qId).toBe("00000");
    expect(q.inputType).toBe("email");
    expect(q.required).toBe(true);
    // The purple line and the Why row are the same in both arms.
    expect(q.formatGuidance).toBe(email.formatGuidance);
    expect(q.howAnswerIsUsed).toBe(email.howAnswerIsUsed);
  });

  it("leaves the control arm's question exactly as it is", () => {
    expect(applyEmailQuestionArm(email, "control")).toBe(email);
  });

  it("never touches any other question", () => {
    expect(applyEmailQuestionArm(name, "anonymous")).toBe(name);
  });
});
