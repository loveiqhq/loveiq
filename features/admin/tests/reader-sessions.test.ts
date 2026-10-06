import { afterEach, describe, expect, it } from "vitest";

import {
  readerSessionDurationsMs,
  type ReaderSessionRow,
} from "@features/admin/server/reader-sessions";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

afterEach(() => {
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

const session = (over: Partial<ReaderSessionRow> = {}): ReaderSessionRow => ({
  started_at: "2026-09-19T10:00:00.000Z",
  ended_at: "2026-09-19T10:01:00.000Z",
  app_user: { email: "reader@gmail.com" },
  ...over,
});

const HOUR = 3_600_000;

/**
 * Two /admin cards read this, and both were blank from the day they shipped
 * because nothing ever wrote `report_session.ended_at`. The moment the close
 * beacon filled that column the cards came alive — and immediately showed the
 * wrong number, because 18 of the first 32 closed sessions were ours (one
 * internal report carried 16 by itself). A 6-second median against a real 44.
 */
describe("readerSessionDurationsMs", () => {
  it("measures a real reader's closed session", () => {
    expect(readerSessionDurationsMs([session()], 4 * HOUR)).toEqual([60_000]);
  });

  it("leaves staff sessions out", () => {
    const rows = [session(), session({ app_user: { email: "iman.beslija@loveiq.org" } })];
    expect(readerSessionDurationsMs(rows, 4 * HOUR)).toEqual([60_000]);
  });

  /**
   * The real shape of the pollution: one internal report reopened sixteen times
   * next to a handful of genuine readers. Averaging over all of it is what
   * turned 44 seconds into 6.
   */
  it("is not dragged down by a staff member reopening a report all afternoon", () => {
    const staffReloads = Array.from({ length: 16 }, () =>
      session({
        ended_at: "2026-09-19T10:00:03.000Z",
        app_user: { email: "qa@loveiq.org" },
      })
    );
    const real = [
      session({ ended_at: "2026-09-19T10:00:44.000Z" }),
      session({ ended_at: "2026-09-19T10:02:36.000Z" }),
    ];
    const out = readerSessionDurationsMs([...staffReloads, ...real], 4 * HOUR);
    expect(out).toEqual([44_000, 156_000]);
  });

  it("honours a custom staff regex", () => {
    process.env.ADMIN_TEST_EMAIL_REGEX = "^.+@example\\.test$";
    __resetStaffEmailRegexForTests();
    const rows = [session({ app_user: { email: "someone@example.test" } }), session()];
    expect(readerSessionDurationsMs(rows, 4 * HOUR)).toEqual([60_000]);
  });

  it("skips a session nobody closed", () => {
    expect(readerSessionDurationsMs([session({ ended_at: null })], 4 * HOUR)).toEqual([]);
  });

  /**
   * A tab left open overnight is not a reading session, and one such row moves
   * an average far more than it moves a median. The cap is the caller's, which
   * is why the two cards can keep their different answers (4h and 24h) without
   * keeping two copies of the rule.
   */
  it.each([
    ["inside the cap", "2026-09-19T13:59:00.000Z", 1],
    ["exactly at the cap", "2026-09-19T14:00:00.000Z", 0],
    ["past the cap", "2026-09-19T20:00:00.000Z", 0],
  ])("a session %s", (_label, ended_at, expected) => {
    expect(readerSessionDurationsMs([session({ ended_at })], 4 * HOUR)).toHaveLength(expected);
  });

  it("drops a session that ended before it started", () => {
    // Clock skew, or an out-of-order write. Report nothing, never a negative.
    expect(
      readerSessionDurationsMs([session({ ended_at: "2026-09-19T09:59:00.000Z" })], 4 * HOUR)
    ).toEqual([]);
  });

  it("drops an unparseable timestamp rather than producing NaN", () => {
    expect(readerSessionDurationsMs([session({ ended_at: "not-a-date" })], 4 * HOUR)).toEqual([]);
  });

  it("treats a missing email as a real reader", () => {
    // report_session.user_id is nullable, and an absent user is not evidence of
    // staff — excluding them would quietly drop real readers.
    const rows = [session({ app_user: null }), session({ app_user: { email: null } })];
    expect(readerSessionDurationsMs(rows, 4 * HOUR)).toEqual([60_000, 60_000]);
  });
});
