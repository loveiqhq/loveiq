// Locks the Slack message format for /api/cron/product-digest.

import { describe, expect, it, vi } from "vitest";
import type { ProductMetrics } from "@features/admin/server/digest-product";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn(),
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  startCronTimer: vi.fn(() => async () => undefined),
  tryClaimSlackAlert: vi.fn().mockResolvedValue(false),
  verifyCronAuth: vi.fn().mockReturnValue(true),
}));

import {
  formatProductDigest,
  formatVoiceOfCustomer,
  formatDropOff,
  formatPricing,
  formatUxQuality,
  formatWizard,
  formatOnboarding,
} from "@/app/api/cron/product-digest/route";

const emptyMetrics: ProductMetrics = {
  voiceOfCustomer: null,
  dropOff: [],
  pricing: [],
  uxQuality: null,
  wizard: null,
  onboarding: null,
  resume: null,
  deviceMix: [],
};

function fullMetrics(): ProductMetrics {
  return {
    voiceOfCustomer: {
      topChapters: [
        { sectionId: "intimacy-patterns", downs: 3, sampleComment: "this didn't resonate" },
        { sectionId: "attachment-style", downs: 2, sampleComment: "too generic" },
      ],
      totalIssuesWithComment: 5,
      topIssueCategories: [
        { issue: "Too long", count: 4 },
        { issue: "Doesn't apply", count: 2 },
      ],
    },
    dropOff: [
      { questionIndex: 14, abandonCount: 7 },
      { questionIndex: 22, abandonCount: 5 },
    ],
    pricing: [
      {
        plan: "essentials",
        quoted: 40,
        checkoutStarted: 18,
        purchased: 12,
        conversionPct: 30,
        revenueEur: 240,
      },
      {
        plan: "full_report",
        quoted: 25,
        checkoutStarted: 10,
        purchased: 6,
        conversionPct: 24,
        revenueEur: 360,
      },
    ],
    uxQuality: {
      rageClicks: 4,
      scroll25: 80,
      scroll50: 60,
      scroll75: 40,
      scroll100: 25,
      scroll75ofMidPct: 66.7,
      scroll100ofMidPct: 41.7,
    },
    wizard: {
      steps: [
        { fromSlide: 0, toSlide: 1, advanced: 100, retainedPct: null },
        { fromSlide: 1, toSlide: 2, advanced: 88, retainedPct: 88 },
        { fromSlide: 2, toSlide: 3, advanced: 60, retainedPct: 68.2 },
      ],
      totalForwards: 248,
    },
    onboarding: {
      invitesSent: 6,
      sharesOpened: 3,
      sharesUnlocked: 1,
      openRatePct: 50,
      unlockRatePct: 33.3,
      viralKFactor: 0.18,
    },
    resume: {
      paused: 12,
      resumed: 4,
      resumeRatePct: 33.3,
    },
    deviceMix: [
      { deviceType: "mobile", count: 60, pct: 60 },
      { deviceType: "desktop", count: 35, pct: 35 },
      { deviceType: "tablet", count: 5, pct: 5 },
    ],
  };
}

describe("formatProductDigest — empty state", () => {
  it("returns the no-signals fallback when every section is empty", () => {
    const msg = formatProductDigest("2026-05-22", emptyMetrics);
    expect(msg).toContain("Product digest");
    expect(msg).toContain("_No product signals today._");
    expect(msg).not.toContain("*Voice of customer*");
    expect(msg).not.toContain("*Survey drop-off*");
  });
});

describe("formatProductDigest — happy path", () => {
  it("renders every section in the expected order", () => {
    const msg = formatProductDigest("2026-05-22", fullMetrics());
    const vocIdx = msg.indexOf("*Voice of customer*");
    const dropIdx = msg.indexOf("*Survey drop-off*");
    const priceIdx = msg.indexOf("*Pricing tier conversion*");
    const uxIdx = msg.indexOf("*UX quality*");
    const wizIdx = msg.indexOf("*Wizard funnel*");
    const obIdx = msg.indexOf("*Onboarding (invites → unlocks)*");
    expect(vocIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(vocIdx);
    expect(priceIdx).toBeGreaterThan(dropIdx);
    expect(uxIdx).toBeGreaterThan(priceIdx);
    expect(wizIdx).toBeGreaterThan(uxIdx);
    expect(obIdx).toBeGreaterThan(wizIdx);
  });

  it("does not render the no-signals fallback when sections are present", () => {
    const msg = formatProductDigest("2026-05-22", fullMetrics());
    expect(msg).not.toContain("_No product signals today._");
  });
});

describe("formatVoiceOfCustomer", () => {
  it("returns [] when snapshot null", () => {
    expect(formatVoiceOfCustomer(emptyMetrics)).toEqual([]);
  });

  it("returns [] when both chapters and categories are empty", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      voiceOfCustomer: { topChapters: [], totalIssuesWithComment: 0, topIssueCategories: [] },
    };
    expect(formatVoiceOfCustomer(m)).toEqual([]);
  });

  it("renders chapters with quoted sample comments", () => {
    const lines = formatVoiceOfCustomer(fullMetrics());
    expect(lines[0]).toBe("*Voice of customer*");
    expect(lines.some((l) => l.includes("intimacy-patterns") && l.includes("3 :thumbsdown:"))).toBe(
      true
    );
    expect(lines.some((l) => l.includes("this didn't resonate"))).toBe(true);
  });
});

describe("formatDropOff", () => {
  it("returns [] when no rows", () => {
    expect(formatDropOff(emptyMetrics)).toEqual([]);
  });

  it("renders one line per top question", () => {
    const lines = formatDropOff(fullMetrics());
    expect(lines[0]).toBe("*Survey drop-off*");
    expect(lines).toContain("• Q14: 7 abandons");
    expect(lines).toContain("• Q22: 5 abandons");
  });
});

describe("formatPricing", () => {
  it("returns [] when no plans qualify", () => {
    expect(formatPricing(emptyMetrics)).toEqual([]);
  });

  it("renders quoted → paid conversion", () => {
    const lines = formatPricing(fullMetrics());
    expect(lines[0]).toBe("*Pricing tier conversion*");
    expect(lines.some((l) => l.includes("essentials") && l.includes("30.0%"))).toBe(true);
    expect(lines.some((l) => l.includes("full_report") && l.includes("24.0%"))).toBe(true);
  });
});

describe("formatUxQuality", () => {
  it("returns [] when literally everything is 0", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      uxQuality: {
        rageClicks: 0,
        scroll25: 0,
        scroll50: 0,
        scroll75: 0,
        scroll100: 0,
        scroll75ofMidPct: null,
        scroll100ofMidPct: null,
      },
    };
    expect(formatUxQuality(m)).toEqual([]);
  });

  it("renders both summary + raw counts", () => {
    const lines = formatUxQuality(fullMetrics());
    expect(lines[0]).toBe("*UX quality*");
    expect(lines.some((l) => l.includes("Rage clicks: 4"))).toBe(true);
    expect(lines.some((l) => l.includes("66.7%"))).toBe(true);
    expect(lines.some((l) => l.includes("Scroll counts: 25% 80"))).toBe(true);
  });
});

describe("formatWizard", () => {
  it("returns [] when no steps", () => {
    expect(formatWizard(emptyMetrics)).toEqual([]);
  });

  it("renders all steps in a single line", () => {
    const lines = formatWizard(fullMetrics());
    expect(lines[0]).toBe("*Wizard funnel*");
    expect(lines[1]).toContain("0→1");
    expect(lines[1]).toContain("1→2");
    expect(lines[1]).toContain("2→3");
    // First step has no prior so retainedPct is null and not emitted as %.
    expect(lines[1]).toContain("88% kept");
  });
});

describe("formatOnboarding", () => {
  it("returns [] when invitesSent is 0", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      onboarding: {
        invitesSent: 0,
        sharesOpened: 0,
        sharesUnlocked: 0,
        openRatePct: null,
        unlockRatePct: null,
      },
    };
    expect(formatOnboarding(m)).toEqual([]);
  });

  it("renders the 3-stage funnel with conversion %", () => {
    const lines = formatOnboarding(fullMetrics());
    expect(lines[0]).toBe("*Onboarding (invites → unlocks)*");
    expect(lines[1]).toContain("6 invites sent");
    expect(lines[1]).toContain("3 opened");
    expect(lines[1]).toContain("50.0%");
    expect(lines[1]).toContain("1 unlocked");
  });
});

// -----------------------------------------------------------------------------
// Round 4: Resume + Device mix + Viral K-factor
// -----------------------------------------------------------------------------

import { formatResume } from "@/app/api/cron/product-digest/route";

describe("formatResume", () => {
  it("returns [] when snapshot null", () => {
    expect(formatResume(emptyMetrics)).toEqual([]);
  });

  it("returns [] when paused is 0", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      resume: { paused: 0, resumed: 0, resumeRatePct: null },
    };
    expect(formatResume(m)).toEqual([]);
  });

  it("renders 'paused → resumed' with rate %", () => {
    const lines = formatResume(fullMetrics());
    expect(lines[0]).toBe("*Resume behavior*");
    expect(lines[1]).toContain("12 paused");
    expect(lines[1]).toContain("4 resumed");
    expect(lines[1]).toContain("33.3% resume rate");
  });
});

describe("formatPricing — device mix inline", () => {
  it("renders Devices at paywall line when deviceMix populated", () => {
    const lines = formatPricing(fullMetrics());
    expect(lines.some((l) => l.startsWith("• Devices at paywall:"))).toBe(true);
    expect(lines.some((l) => l.includes("mobile 60%"))).toBe(true);
    expect(lines.some((l) => l.includes("desktop 35%"))).toBe(true);
  });

  it("still renders Pricing section when ONLY device mix is present", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      deviceMix: [{ deviceType: "mobile", count: 10, pct: 100 }],
    };
    const lines = formatPricing(m);
    expect(lines[0]).toBe("*Pricing tier conversion*");
    expect(lines.some((l) => l.includes("Devices at paywall"))).toBe(true);
  });
});

describe("formatOnboarding — viral K-factor", () => {
  it("renders the K-factor line when viralKFactor is set", () => {
    const lines = formatOnboarding(fullMetrics());
    expect(lines.some((l) => l.includes("Viral K-factor: 0.18"))).toBe(true);
  });

  it("omits the K-factor line when null", () => {
    const m: ProductMetrics = {
      ...emptyMetrics,
      onboarding: {
        invitesSent: 5,
        sharesOpened: 2,
        sharesUnlocked: 0,
        openRatePct: 40,
        unlockRatePct: null,
        viralKFactor: null,
      },
    };
    const lines = formatOnboarding(m);
    expect(lines.some((l) => l.includes("Viral K-factor"))).toBe(false);
  });
});
