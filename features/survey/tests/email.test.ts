import { describe, expect, it } from "vitest";
import { z } from "zod";

import { isValidSurveyEmail, SURVEY_EMAIL_RE, tidySurveyEmail } from "@features/survey/email";

/**
 * The email question and /api/survey must agree, or a reader is refused at the very end
 * on every Retry (2026-10-04 audit: 17 shapes the question let through, the server refused).
 */
describe("the survey's email rule", () => {
  it.each([
    "name@gmail.com",
    "first.last@example.co.uk",
    "Name+tag@Example.com",
    "o'brien@example.ie",
    "x_y-z@sub.domain.museum",
    "a@b.co",
  ])("accepts %s", (address) => {
    expect(isValidSurveyEmail(address)).toBe(true);
  });

  it.each([
    "name.@gmail.com",
    "na..me@gmail.com",
    ".name@gmail.com",
    "name@gmail..com",
    "name@gmail.c",
    "name@gmail.c0m",
    "jörg@example.de",
    "name@exämple.de",
    "name@example.рф",
    "o’brien@example.ie",
    "a&b@example.com",
    "name@exa_mple.com",
    "name@",
    "@example.com",
    "name example@gmail.com",
  ])("refuses %s, as the server does", (address) => {
    expect(isValidSurveyEmail(address)).toBe(false);
  });

  it("tidies what pasting adds, without repairing the address", () => {
    expect(tidySurveyEmail("  mailto:Name@Example.com  ")).toBe("Name@Example.com");
    expect(tidySurveyEmail("<name@example.com>")).toBe("name@example.com");
    expect(tidySurveyEmail("“name@example.com”")).toBe("name@example.com");
    expect(tidySurveyEmail("name@example.com.")).toBe("name@example.com");
    expect(tidySurveyEmail("name@example.com,")).toBe("name@example.com");
    expect(isValidSurveyEmail("name@example.com.")).toBe(true);
  });

  it("is exactly zod's email check, so an upgrade cannot split the two sides", () => {
    // If zod changes its pattern, this fails and SURVEY_EMAIL_RE needs a conscious update.
    const samples = [
      "name@gmail.com",
      "o'brien@example.ie",
      "na..me@gmail.com",
      "name.@gmail.com",
      "jörg@example.de",
      "name@exa_mple.com",
      "a@b.co",
      "name@gmail.c",
    ];
    for (const sample of samples) {
      expect(SURVEY_EMAIL_RE.test(sample), sample).toBe(
        z.string().email().safeParse(sample).success
      );
    }
  });
});
