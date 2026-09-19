import { describe, expect, it } from "vitest";

import { extractArtifacts } from "../check-migration-drift.mjs";

type Artifacts = {
  functions: Set<string>;
  tables: Set<string>;
  indexes: Map<string, string>;
  constraints: Map<string, string>;
  columns: Map<string, { table: string; column: string }>;
};

const run = (files: { file: string; sql: string }[]): Artifacts => extractArtifacts(files);

describe("migration drift — repo artifact extraction", () => {
  /**
   * The check shipped with `CREATE INDEX CONCURRENTLY` unmatched, so 29 of the
   * repo's 61 indexes were invisible and could never be reported as drift.
   * Every form the repo actually uses has to be seen.
   */
  it("sees CONCURRENTLY indexes, not just plain ones", () => {
    const { indexes } = run([
      {
        file: "1_a.sql",
        sql: `
          CREATE INDEX idx_plain ON booking_event (email);
          CREATE INDEX CONCURRENTLY idx_conc ON booking_event (email);
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conc_ine ON booking_event (created_at DESC);
          CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_uniq_conc ON booking_event (email);
        `,
      },
    ]);
    expect([...indexes.keys()].sort()).toEqual([
      "idx_conc",
      "idx_conc_ine",
      "idx_plain",
      "idx_uniq_conc",
    ]);
  });

  /**
   * Tables were the last thing the check could not see at all. 10 of the repo's
   * 83 carry no index, ADD CONSTRAINT or ADD COLUMN of their own, so if one went
   * missing from live NOTHING else would drift — admin_users and survey_question
   * among them.
   */
  it("sees a table that has no index, column or constraint of its own", () => {
    const { tables } = run([
      { file: "1.sql", sql: `CREATE TABLE IF NOT EXISTS system_flags (key text PRIMARY KEY);` },
    ]);
    expect([...tables]).toEqual(["system_flags"]);
  });

  /**
   * "CREATE TABLE" turns up in prose often enough that an unanchored pattern
   * registers a table called `rather`, from a real comment in the repo:
   * "every NOT NULL is inside CREATE TABLE rather than ADD COLUMN".
   */
  it("ignores CREATE TABLE inside a comment", () => {
    const { tables } = run([
      {
        file: "1.sql",
        sql: [
          "-- every NOT NULL is inside CREATE TABLE rather than ADD COLUMN, and no",
          "CREATE TABLE real_one (id bigint);",
        ].join("\n"),
      },
    ]);
    expect([...tables]).toEqual(["real_one"]);
  });

  /**
   * A dropped table takes its indexes with it. Without this the checker reports
   * a deliberate removal as drift for ever — the cry-wolf failure that kept the
   * job switched off. calendly_webhook_event is the real case.
   */
  it("a dropped table purges its own indexes, columns and constraints", () => {
    const a = run([
      {
        file: "1_create.sql",
        sql: `
          CREATE TABLE calendly_webhook_event (id bigint);
          CREATE INDEX CONCURRENTLY idx_cwe_received ON calendly_webhook_event (received_at);
          CREATE INDEX CONCURRENTLY idx_keep ON booking_event (email);
          ALTER TABLE calendly_webhook_event ADD COLUMN note text;
          ALTER TABLE calendly_webhook_event ADD CONSTRAINT cwe_key UNIQUE (event_key);
        `,
      },
      { file: "2_drop.sql", sql: `DROP TABLE IF EXISTS calendly_webhook_event;` },
    ]);
    expect([...a.tables]).toEqual([]);
    expect([...a.indexes.keys()]).toEqual(["idx_keep"]);
    expect([...a.columns.keys()]).toEqual([]);
    expect([...a.constraints.keys()]).toEqual([]);
  });

  /**
   * Ordering is by position, so drop-then-recreate in the SAME file must end
   * with the table's artifacts PRESENT. report_access_token does exactly this.
   */
  it("keeps artifacts when a table is dropped and recreated after", () => {
    const { indexes } = run([
      {
        file: "1.sql",
        sql: `
          DROP TABLE IF EXISTS report_access_token CASCADE;
          CREATE TABLE report_access_token (id bigint);
          CREATE INDEX CONCURRENTLY idx_rat ON report_access_token (token);
        `,
      },
    ]);
    expect([...indexes.keys()]).toEqual(["idx_rat"]);
  });
});
