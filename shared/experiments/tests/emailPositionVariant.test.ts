// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignEmailPositionVariant,
  isEmailPositionVariant,
  normalizeEmailPositionVariant,
  resolveEmailPositionDevOverride,
  orderByEmailPosition,
  EMAIL_POSITION_COOKIE,
  EMAIL_QID,
  OPT_IN_QID,
  type EmailPositionVariant,
} from "@shared/experiments/emailPositionVariant";
import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";

function clearCookie() {
  document.cookie = `${EMAIL_POSITION_COOKIE}=; Path=/; Max-Age=0`;
}

afterEach(() => {
  clearCookie();
  vi.unstubAllEnvs();
});

/** Minimal SurveyQuestion stub — orderByEmailPosition only reads `qId`. */
function q(qId: string): SurveyQuestion {
  return { qId } as unknown as SurveyQuestion;
}

describe("isEmailPositionVariant / normalizeEmailPositionVariant", () => {
  it("recognizes only first|last", () => {
    expect(isEmailPositionVariant("first")).toBe(true);
    expect(isEmailPositionVariant("last")).toBe(true);
    expect(isEmailPositionVariant("white")).toBe(false);
    expect(isEmailPositionVariant(null)).toBe(false);
  });

  it("normalizes anything non-last to first (the control)", () => {
    expect(normalizeEmailPositionVariant("first")).toBe("first");
    expect(normalizeEmailPositionVariant("last")).toBe("last");
    expect(normalizeEmailPositionVariant("garbage")).toBe("first");
    expect(normalizeEmailPositionVariant(undefined)).toBe("first");
  });
});

describe("resolveEmailPositionDevOverride", () => {
  it("honours ?emailPosition=first|last in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveEmailPositionDevOverride("first")).toBe("first");
    expect(resolveEmailPositionDevOverride("last")).toBe("last");
    expect(resolveEmailPositionDevOverride("bogus")).toBeNull();
    expect(resolveEmailPositionDevOverride(null)).toBeNull();
  });

  it("honours the override on staging / preview deploys", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(resolveEmailPositionDevOverride("last")).toBe("last");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://loveiq-web-abc123.vercel.app");
    expect(resolveEmailPositionDevOverride("first")).toBe("first");
  });

  it("is OFF on production (apex/www) so real users can't self-select", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(resolveEmailPositionDevOverride("first")).toBeNull();
    expect(resolveEmailPositionDevOverride("last")).toBeNull();
  });

  it("defaults to OFF when the site URL is unknown/empty (safe default)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveEmailPositionDevOverride("last")).toBeNull();
  });
});

describe("assignEmailPositionVariant", () => {
  it("reuses an existing sticky cookie", () => {
    document.cookie = `${EMAIL_POSITION_COOKIE}=first; Path=/`;
    expect(assignEmailPositionVariant()).toBe("first");
    document.cookie = `${EMAIL_POSITION_COOKIE}=last; Path=/`;
    expect(assignEmailPositionVariant()).toBe("last");
  });

  it("mints + persists a variant when none exists", () => {
    clearCookie();
    const assigned = assignEmailPositionVariant();
    expect(["first", "last"]).toContain(assigned);
    // The minted value is now stickily readable.
    expect(assignEmailPositionVariant()).toBe(assigned);
  });

  it("produces BOTH arms across fresh assignments (≈50/50)", () => {
    const arms = new Set<string>();
    let lastCount = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      clearCookie();
      const v = assignEmailPositionVariant();
      arms.add(v);
      if (v === "last") lastCount++;
    }
    expect(arms.has("first")).toBe(true);
    expect(arms.has("last")).toBe(true);
    const ratio = lastCount / N;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });

  it("lets the dev override win over the cookie", () => {
    vi.stubEnv("NODE_ENV", "development");
    document.cookie = `${EMAIL_POSITION_COOKIE}=first; Path=/`;
    expect(assignEmailPositionVariant("last")).toBe("last");
  });
});

describe("orderByEmailPosition", () => {
  const variants: EmailPositionVariant[] = ["first", "last"];

  it("'first' returns the SAME array reference (byte-identical control)", () => {
    expect(orderByEmailPosition(surveyQuestions, "first")).toBe(surveyQuestions);
  });

  it("'last' moves the email question to immediately before the opt-in", () => {
    const ordered = orderByEmailPosition(surveyQuestions, "last");
    const optInIdx = ordered.findIndex((q2) => q2.qId === OPT_IN_QID);
    expect(optInIdx).toBeGreaterThan(0);
    // Email sits exactly one slot before the opt-in.
    expect(ordered[optInIdx - 1]!.qId).toBe(EMAIL_QID);
  });

  it("'last' preserves length, keeps email exactly once, and is not first", () => {
    const ordered = orderByEmailPosition(surveyQuestions, "last");
    expect(ordered.length).toBe(surveyQuestions.length);
    expect(ordered.filter((q2) => q2.qId === EMAIL_QID)).toHaveLength(1);
    expect(ordered[0]!.qId).not.toBe(EMAIL_QID);
  });

  it("'last' preserves the relative order of every non-email question", () => {
    const ordered = orderByEmailPosition(surveyQuestions, "last");
    const withoutEmail = (qs: SurveyQuestion[]) =>
      qs.filter((x) => x.qId !== EMAIL_QID).map((x) => x.qId);
    expect(withoutEmail(ordered)).toEqual(withoutEmail([...surveyQuestions]));
  });

  it.each(variants)("never drops or duplicates any question (%s)", (variant) => {
    const ordered = orderByEmailPosition(surveyQuestions, variant);
    expect([...ordered].map((x) => x.qId).sort()).toEqual(
      [...surveyQuestions].map((x) => x.qId).sort()
    );
  });

  it("falls back to appending email at the end when the opt-in is absent", () => {
    const input = [q(EMAIL_QID), q("00001"), q("00002")];
    const ordered = orderByEmailPosition(input, "last");
    expect(ordered.map((x) => x.qId)).toEqual(["00001", "00002", EMAIL_QID]);
  });

  it("returns input unchanged when there is no email question to move", () => {
    const input = [q("00001"), q(OPT_IN_QID)];
    expect(orderByEmailPosition(input, "last")).toBe(input);
  });
});
