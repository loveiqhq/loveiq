// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignSurveyVariant,
  isSurveyVariant,
  normalizeSurveyVariant,
  resolveSurveyDevOverride,
  SURVEY_VARIANT_COOKIE,
} from "@shared/experiments/surveyVariant";

function clearSurveyCookie() {
  document.cookie = `${SURVEY_VARIANT_COOKIE}=; Path=/; Max-Age=0`;
}

afterEach(() => {
  clearSurveyCookie();
  vi.unstubAllEnvs();
});

describe("isSurveyVariant / normalizeSurveyVariant", () => {
  it("recognizes only white|dark", () => {
    expect(isSurveyVariant("white")).toBe(true);
    expect(isSurveyVariant("dark")).toBe(true);
    expect(isSurveyVariant("control")).toBe(false);
    expect(isSurveyVariant(null)).toBe(false);
  });

  it("normalizes anything non-white to dark", () => {
    expect(normalizeSurveyVariant("white")).toBe("white");
    expect(normalizeSurveyVariant("dark")).toBe("dark");
    expect(normalizeSurveyVariant("garbage")).toBe("dark");
    expect(normalizeSurveyVariant(undefined)).toBe("dark");
  });
});

describe("resolveSurveyDevOverride", () => {
  it("is null outside development regardless of param", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveSurveyDevOverride("white")).toBeNull();
    expect(resolveSurveyDevOverride("dark")).toBeNull();
  });

  it("honours ?survey=white|dark only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveSurveyDevOverride("white")).toBe("white");
    expect(resolveSurveyDevOverride("dark")).toBe("dark");
    expect(resolveSurveyDevOverride("bogus")).toBeNull();
    expect(resolveSurveyDevOverride(null)).toBeNull();
  });
});

describe("assignSurveyVariant", () => {
  it("reuses an existing sticky cookie", () => {
    document.cookie = `${SURVEY_VARIANT_COOKIE}=white; Path=/`;
    expect(assignSurveyVariant()).toBe("white");
    document.cookie = `${SURVEY_VARIANT_COOKIE}=dark; Path=/`;
    expect(assignSurveyVariant()).toBe("dark");
  });

  it("mints + persists a variant when none exists", () => {
    clearSurveyCookie();
    const assigned = assignSurveyVariant();
    expect(["white", "dark"]).toContain(assigned);
    // The minted value is now stickily readable.
    expect(assignSurveyVariant()).toBe(assigned);
  });

  it("produces BOTH arms across fresh assignments (≈50/50)", () => {
    const arms = new Set<string>();
    let whiteCount = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      clearSurveyCookie();
      const v = assignSurveyVariant();
      arms.add(v);
      if (v === "white") whiteCount++;
    }
    expect(arms.has("white")).toBe(true);
    expect(arms.has("dark")).toBe(true);
    const ratio = whiteCount / N;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });

  it("lets the dev override win over the cookie", () => {
    vi.stubEnv("NODE_ENV", "development");
    document.cookie = `${SURVEY_VARIANT_COOKIE}=dark; Path=/`;
    expect(assignSurveyVariant("white")).toBe("white");
  });
});
