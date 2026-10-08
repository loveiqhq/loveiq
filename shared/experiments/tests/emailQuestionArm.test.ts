import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignEmailQuestionArm,
  EMAIL_QUESTION_ARM_KEY,
  EMAIL_QUESTION_EXPERIMENT,
  isEmailQuestionArm,
  resolveEmailQuestionOverride,
} from "@shared/experiments/emailQuestionArm";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";

afterEach(() => {
  vi.unstubAllEnvs();
});

const session = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("assignEmailQuestionArm", () => {
  it("gives a session the same arm every time", () => {
    for (const id of [session(1), session(7), "6f1c2a44-8e21-4d0b-9a77-2b3c4d5e6f70"]) {
      expect(assignEmailQuestionArm(id)).toBe(assignEmailQuestionArm(id));
    }
  });

  it("shows the current question when there is no session id", () => {
    // Only outside a browser: getSessionId() makes an id even where storage is blocked.
    for (const empty of [null, undefined, "", "   "]) {
      expect(assignEmailQuestionArm(empty)).toBe("control");
    }
  });

  it("splits sessions about 50/50", () => {
    const n = 20_000;
    let anonymous = 0;
    for (let i = 0; i < n; i += 1)
      if (assignEmailQuestionArm(session(i)) === "anonymous") anonymous += 1;
    expect(anonymous / n).toBeGreaterThan(0.48);
    expect(anonymous / n).toBeLessThan(0.52);
  });

  /**
   * C13 has been live on the same sessions since 2026-10-06. If the two splits were
   * correlated, each test's result would carry the other's effect. With its own salt
   * on the finished hash, every combination of the two arms gets about a quarter.
   */
  it("splits independently of C13's opening order", () => {
    const n = 20_000;
    const cells = new Map<string, number>();
    for (let i = 0; i < n; i += 1) {
      const id = session(i);
      const key = `${assignQuestionOrderArm(id)}:${assignEmailQuestionArm(id)}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    for (const key of [
      "control:control",
      "control:anonymous",
      "variant:control",
      "variant:anonymous",
    ]) {
      const share = (cells.get(key) ?? 0) / n;
      expect(share, key).toBeGreaterThan(0.23);
      expect(share, key).toBeLessThan(0.27);
    }
  });

  it("only ever returns a valid arm", () => {
    for (let i = 0; i < 200; i += 1)
      expect(isEmailQuestionArm(assignEmailQuestionArm(`s${i}`))).toBe(true);
  });
});

describe("resolveEmailQuestionOverride", () => {
  it("lets staging preview either arm with ?email=", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(resolveEmailQuestionOverride("anonymous")).toBe("anonymous");
    expect(resolveEmailQuestionOverride("control")).toBe("control");
  });

  it("is ignored on production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveEmailQuestionOverride("anonymous")).toBeNull();
  });

  it("ignores anything that is not an arm", () => {
    for (const junk of [null, undefined, "", "variant", "ANONYMOUS"]) {
      expect(resolveEmailQuestionOverride(junk)).toBeNull();
    }
  });
});

describe("names", () => {
  it("names the experiment and the stamp key the readout will group by", () => {
    expect(EMAIL_QUESTION_EXPERIMENT).toBe("survey-email-anonymous");
    expect(EMAIL_QUESTION_ARM_KEY).toBe("contact_question_arm");
  });

  /**
   * The admin's UTM filter is a substring match on the whole tracker
   * (`utm_tracker ILIKE '%' || filter || '%'`), and "email" is a source our own links
   * carry (`utm_source=email`). A stamp key with "email" in it would match that filter
   * on every stamped row.
   */
  it("keeps the word email out of the stamp key", () => {
    expect(EMAIL_QUESTION_ARM_KEY).not.toMatch(/email/i);
  });
});
