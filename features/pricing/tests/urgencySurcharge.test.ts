import { describe, expect, it } from "vitest";

import {
  URGENCY_SURCHARGE_CENTS,
  isUrgencyExpired,
  mergeUrgencyDeadline,
  readUrgencyDeadline,
  urgencySurchargeCents,
} from "@features/pricing/logic/urgencySurcharge";

/**
 * The rule that makes the paywall countdown mean something: once a reader's three
 * minutes are up, every plan costs two euros more — on the report and at checkout.
 *
 * This is money arithmetic, so the boundaries are pinned explicitly.
 */
describe("urgency surcharge", () => {
  const deadline = "2026-08-23T12:00:00.000Z";
  const at = (iso: string) => Date.parse(iso);

  describe("isUrgencyExpired", () => {
    it("is false while the window is still open", () => {
      expect(isUrgencyExpired(deadline, at("2026-08-23T11:59:59.999Z"))).toBe(false);
    });

    it("is false exactly ON the deadline", () => {
      // The visible timer flips to `expired` at remainingMs <= 0, i.e. the instant it
      // reads 00:00 — one millisecond later than this. Charging on the same tick the
      // reader still sees a running clock is the one boundary that must not slip.
      expect(isUrgencyExpired(deadline, at(deadline))).toBe(false);
    });

    it("is true one millisecond after", () => {
      expect(isUrgencyExpired(deadline, at("2026-08-23T12:00:00.001Z"))).toBe(true);
    });

    it("is false when there is no deadline — the reader never reached the paywall", () => {
      expect(isUrgencyExpired(null)).toBe(false);
      expect(isUrgencyExpired(undefined)).toBe(false);
    });

    it("is false for a deadline that is not a date, rather than throwing", () => {
      expect(isUrgencyExpired("not-a-date")).toBe(false);
    });
  });

  describe("urgencySurchargeCents", () => {
    it("adds two euros once the window has closed", () => {
      expect(
        urgencySurchargeCents({
          deadlineAt: deadline,
          enabled: true,
          now: at("2026-08-23T12:05:00.000Z"),
        })
      ).toBe(URGENCY_SURCHARGE_CENTS);
      expect(URGENCY_SURCHARGE_CENTS).toBe(200);
    });

    it("adds nothing while the window is open", () => {
      expect(
        urgencySurchargeCents({
          deadlineAt: deadline,
          enabled: true,
          now: at("2026-08-23T11:58:00.000Z"),
        })
      ).toBe(0);
    });

    it("adds nothing when the flag is off, however long ago the window closed", () => {
      // The kill switch has to be total: this is what makes the feature revertible
      // without a deploy.
      expect(
        urgencySurchargeCents({
          deadlineAt: deadline,
          enabled: false,
          now: at("2027-01-01T00:00:00.000Z"),
        })
      ).toBe(0);
    });

    it("adds nothing when there is no deadline at all", () => {
      expect(urgencySurchargeCents({ deadlineAt: null, enabled: true })).toBe(0);
    });
  });

  describe("readUrgencyDeadline", () => {
    it("reads the stored deadline", () => {
      expect(readUrgencyDeadline({ urgency: { deadlineAt: deadline } })).toBe(deadline);
    });

    it("returns null for anything shaped wrong, rather than throwing", () => {
      // This reads a jsonb column, so it has to survive whatever is in there.
      for (const metadata of [
        null,
        undefined,
        "string",
        42,
        [],
        {},
        { urgency: null },
        { urgency: [] },
        { urgency: "soon" },
        { urgency: { deadlineAt: 42 } },
        { urgency: { deadlineAt: "never" } },
      ]) {
        expect(readUrgencyDeadline(metadata)).toBeNull();
      }
    });
  });

  describe("mergeUrgencyDeadline", () => {
    it("arms an unarmed quote", () => {
      const { metadata, deadlineAt } = mergeUrgencyDeadline({ other: "kept" }, deadline);
      expect(deadlineAt).toBe(deadline);
      expect(readUrgencyDeadline(metadata)).toBe(deadline);
      expect(metadata.other).toBe("kept");
    });

    it("never re-arms, so a reader cannot buy back the lower price by reopening", () => {
      const armed = { urgency: { deadlineAt: deadline } };
      const { deadlineAt } = mergeUrgencyDeadline(armed, "2027-01-01T00:00:00.000Z");
      expect(deadlineAt).toBe(deadline);
    });

    it("never extends a window that has already closed", () => {
      const long_ago = { urgency: { deadlineAt: "2020-01-01T00:00:00.000Z" } };
      const { metadata, deadlineAt } = mergeUrgencyDeadline(long_ago, deadline);
      expect(deadlineAt).toBe("2020-01-01T00:00:00.000Z");
      expect(readUrgencyDeadline(metadata)).toBe("2020-01-01T00:00:00.000Z");
    });

    it("does not mutate the metadata it was given", () => {
      const original = { other: "kept" };
      mergeUrgencyDeadline(original, deadline);
      expect(original).toEqual({ other: "kept" });
    });
  });
});
