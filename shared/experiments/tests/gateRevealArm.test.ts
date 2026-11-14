import { afterEach, describe, expect, it, vi } from "vitest";
import { assignEmailQuestionArm } from "@shared/experiments/emailQuestionArm";
import {
  assignGateRevealArm,
  GATE_REVEAL_ARM_KEY,
  GATE_REVEAL_EXPERIMENT,
  isGateRevealArm,
  resolveGateRevealOverride,
} from "@shared/experiments/gateRevealArm";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";

afterEach(() => {
  vi.unstubAllEnvs();
});

const session = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("assignGateRevealArm", () => {
  it("gives a session the same arm every time", () => {
    for (const id of [session(1), session(7), "6f1c2a44-8e21-4d0b-9a77-2b3c4d5e6f70"]) {
      expect(assignGateRevealArm(id)).toBe(assignGateRevealArm(id));
    }
  });

  it("keeps a run with no session id on today's EUR 1.99 page", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(assignGateRevealArm(empty)).toBe("control");
    }
  });

  it("splits sessions about 50/50", () => {
    const n = 20_000;
    let reveal = 0;
    for (let i = 0; i < n; i += 1) if (assignGateRevealArm(session(i)) === "reveal") reveal += 1;
    expect(reveal / n).toBeGreaterThan(0.48);
    expect(reveal / n).toBeLessThan(0.52);
  });

  /**
   * C13 runs on the same sessions until 20 Nov, and the email question's arms are still
   * stamped on them. A split correlated with either would carry its effect into this test.
   */
  it("splits independently of C13's opening order and of the email question", () => {
    const n = 20_000;
    const order = new Map<string, number>();
    const email = new Map<string, number>();
    for (let i = 0; i < n; i += 1) {
      const id = session(i);
      const arm = assignGateRevealArm(id);
      const a = `${assignQuestionOrderArm(id)}:${arm}`;
      const b = `${assignEmailQuestionArm(id)}:${arm}`;
      order.set(a, (order.get(a) ?? 0) + 1);
      email.set(b, (email.get(b) ?? 0) + 1);
    }
    for (const cells of [order, email]) {
      expect(cells.size).toBe(4);
      for (const [key, count] of cells) {
        expect(count / n, key).toBeGreaterThan(0.23);
        expect(count / n, key).toBeLessThan(0.27);
      }
    }
  });

  it("only ever returns a valid arm", () => {
    for (let i = 0; i < 200; i += 1)
      expect(isGateRevealArm(assignGateRevealArm(`s${i}`))).toBe(true);
  });

  it("names the experiment and its tracker key", () => {
    expect(GATE_REVEAL_EXPERIMENT).toBe("gate_reveal_2026_11");
    expect(GATE_REVEAL_ARM_KEY).toBe("gate_reveal_arm");
  });
});

describe("resolveGateRevealOverride", () => {
  it("lets staging preview either arm", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(resolveGateRevealOverride("1")).toBe("reveal");
    expect(resolveGateRevealOverride("0")).toBe("control");
  });

  it("is ignored on production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveGateRevealOverride("1")).toBeNull();
  });

  it("ignores anything else", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    for (const value of [null, undefined, "", "yes", "reveal"]) {
      expect(resolveGateRevealOverride(value)).toBeNull();
    }
  });
});
