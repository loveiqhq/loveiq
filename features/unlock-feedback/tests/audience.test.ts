import { describe, expect, it } from "vitest";

import {
  candidateWindow,
  readerOf,
  type CandidateRow,
} from "@features/unlock-feedback/logic/audience";
import { UNLOCK_FEEDBACK_FROM } from "@features/unlock-feedback/logic/launch";

const HOUR = 3_600_000;

function row(sub: NonNullable<CandidateRow["survey_submission"]>): CandidateRow {
  return { id: 1, survey_submission_id: 10, survey_submission: sub };
}

const reader = {
  user_id: 7,
  duration_ms: 9 * 60_000,
  app_user: { email: "ana@example.com", processing_restricted_at: null },
  scoring_result: [{ primary_archetype: "Spark Seeker", v5_primary_archetype: "Spiritual Lover" }],
};

describe("who the unlock feedback email goes to", () => {
  it("takes a real reader, naming their archetype as the report titles it", () => {
    expect(readerOf(row(reader))).toEqual({
      email: "ana@example.com",
      userId: 7,
      archetypeName: "The Spiritual Lover",
    });
  });

  it("reads a single scoring object and an archetype stored under its old name", () => {
    expect(
      readerOf(row({ ...reader, scoring_result: { primary_archetype: "Approval Seeker" } }))
    ).toMatchObject({ archetypeName: "The Tender Devotee" });
  });

  it("skips anyone restricted, without an address or without an archetype", () => {
    const restricted = { ...reader.app_user, processing_restricted_at: "2026-10-01T00:00:00Z" };
    expect(readerOf(row({ ...reader, app_user: restricted }))).toEqual({ skip: "restricted" });
    expect(readerOf(row({ ...reader, app_user: { email: "  " } }))).toEqual({ skip: "no_email" });
    expect(readerOf(row({ ...reader, app_user: null }))).toEqual({ skip: "no_email" });
    expect(readerOf({ id: 1, survey_submission_id: 10 })).toEqual({ skip: "no_email" });
    expect(readerOf(row({ ...reader, scoring_result: [] }))).toEqual({ skip: "no_archetype" });
    expect(
      readerOf(row({ ...reader, scoring_result: [{ primary_archetype: "Mystery Type" }] }))
    ).toEqual({ skip: "no_archetype" });
  });

  it("skips staff and runs too fast to be real, by the admin panel's test rule", () => {
    expect(readerOf(row({ ...reader, app_user: { email: "ec@loveiq.org" } }))).toEqual({
      skip: "test",
    });
    expect(readerOf(row({ ...reader, duration_ms: 45_000 }))).toEqual({ skip: "test" });
    // An unknown duration is not evidence of a test.
    expect(readerOf(row({ ...reader, duration_ms: null }))).toMatchObject({ userId: 7 });
  });
});

describe("the reports one run looks at", () => {
  const launch = Date.parse(UNLOCK_FEEDBACK_FROM);

  it("are those created 3 to 5 hours ago", () => {
    const now = launch + 30 * HOUR;
    expect(candidateWindow(now)).toEqual({
      from: new Date(now - 5 * HOUR).toISOString(),
      to: new Date(now - 3 * HOUR).toISOString(),
    });
  });

  it("never reach back before the launch", () => {
    expect(candidateWindow(launch + 4 * HOUR)).toEqual({
      from: new Date(launch).toISOString(),
      to: new Date(launch + HOUR).toISOString(),
    });
    expect(candidateWindow(launch + 2 * HOUR)).toBeNull();
    expect(candidateWindow(launch - 24 * HOUR)).toBeNull();
  });
});
