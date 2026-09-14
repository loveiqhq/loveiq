import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildReviewMessage,
  detectDrift,
  fetchFindings,
  firstSentence,
  recordingLink,
  type UxFinding,
} from "../server/review";
import { UX_REVIEW_MIN_CONFIDENCE, UX_SCANNERS } from "../server/scanners";

const finding = (over: Partial<UxFinding> = {}): UxFinding => ({
  observationId: "01a0-obs",
  sessionId: "01a0-sess",
  scannerId: UX_SCANNERS[1]!.id ?? "sid",
  scannerName: UX_SCANNERS[1]!.name,
  scannerVersion: UX_SCANNERS[1]!.scannerVersion,
  confidence: 0.9,
  reasoning:
    "The paywall card did not respond to a tap. It happened on the locked chapter. Cited at t=120s.",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("buildReviewMessage", () => {
  it("is four blocks and leads with the finding, not the working out", () => {
    const { text, blocks } = buildReviewMessage(finding());
    expect(blocks).toHaveLength(4);
    expect(blocks[1]).toMatchObject({
      type: "section",
      text: { text: expect.stringContaining("The paywall card did not respond to a tap.") },
    });
    // The rest of the model's prose must NOT be in the message — "very short
    // summary" was the actual requirement on the card.
    expect(JSON.stringify(blocks)).not.toContain("Cited at t=120s");
    expect(text).toContain("UX review");
  });

  it("links to the recording by path, which opens it", () => {
    const { blocks } = buildReviewMessage(finding({ sessionId: "abc-123" }));
    // /replay/<id> opens the recording; the query-param form lands on a filtered
    // LIST, which reads as a broken link to whoever clicked it.
    expect(JSON.stringify(blocks)).toContain("/replay/abc-123");
    expect(recordingLink("a b")).toContain("a%20b");
  });

  it("always says the finding is unreviewed", () => {
    // The human-in-the-loop commitment, expressed where a reader will see it.
    // Nothing this pipeline posts may read as established fact.
    const { blocks } = buildReviewMessage(finding());
    expect(JSON.stringify(blocks)).toContain("unreviewed");
  });

  it("mentions the unrated backlog only when there is one", () => {
    expect(JSON.stringify(buildReviewMessage(finding(), 0).blocks)).not.toContain("unrated");
    expect(JSON.stringify(buildReviewMessage(finding(), 3).blocks)).toContain("3 unrated");
  });

  it("escapes model prose, which describes a session anyone could have staged", () => {
    const { blocks } = buildReviewMessage(
      finding({ reasoning: "A <script> & *bold* thing broke here." })
    );
    const json = JSON.stringify(blocks);
    // Slack markup, not HTML: the repo neutralises <>&*_~` by backslash-escaping,
    // which stops prose being read as a link or as bold/italic formatting.
    expect(json).toContain("\\\\<script");
    expect(json).toContain("\\\\*bold");
    expect(json).not.toMatch(/[^\\]\*bold/);
  });

  it("clamps a runaway reasoning so one finding cannot fill the channel", () => {
    const { blocks } = buildReviewMessage(finding({ reasoning: "x".repeat(5000) }));
    const body = JSON.stringify(blocks[1]);
    expect(body.length).toBeLessThan(400);
  });
});

describe("firstSentence", () => {
  it("stops at the first sentence and survives prose without one", () => {
    expect(firstSentence("One thing. Two thing.")).toBe("One thing.");
    expect(firstSentence("  no full stop here ")).toBe("no full stop here");
  });
});

describe("detectDrift", () => {
  it("fires when PostHog's live version is ahead of the version pinned in git", () => {
    const scanner = UX_SCANNERS[0]!;
    const drift = detectDrift([
      { scannerName: scanner.name, scannerVersion: scanner.scannerVersion + 1 },
    ]);
    expect(drift).toEqual([
      {
        scannerName: scanner.name,
        pinnedVersion: scanner.scannerVersion,
        liveVersion: scanner.scannerVersion + 1,
      },
    ]);
  });

  it("stays quiet when they agree", () => {
    const scanner = UX_SCANNERS[0]!;
    expect(
      detectDrift([{ scannerName: scanner.name, scannerVersion: scanner.scannerVersion }])
    ).toEqual([]);
  });
});

describe("fetchFindings", () => {
  it("asks only for high-confidence YES verdicts, so weak hits never reach Slack", async () => {
    let sentBody = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
    });
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await fetchFindings();
    expect(sentBody).toContain("scanner_output_verdict = 'yes'");
    expect(sentBody).toContain(String(UX_REVIEW_MIN_CONFIDENCE));
  });

  it("throws on a HogQL error returned with HTTP 200", async () => {
    // PostHog answers a bad query 200-with-error. Treating that as "no findings"
    // makes a broken detector look exactly like a healthy product.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ error: "Unknown field", results: [] }),
    }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await expect(fetchFindings()).rejects.toThrow(/posthog query error/);
  });

  it("returns nothing rather than throwing when PostHog is not configured", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "");
    await expect(fetchFindings()).resolves.toEqual([]);
  });
});
