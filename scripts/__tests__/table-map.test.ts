import { describe, expect, it } from "vitest";

import {
  areaOf,
  coreFlow,
  findViews,
  firstSentence,
  parseOpenApi,
  render,
} from "../generate-table-map.mjs";

const doc = {
  definitions: {
    payment: {
      description: "Money in. One row per Stripe session.",
      properties: {
        id: { description: "Note:\nThis is a Primary Key.<pk/>" },
        personal_report_id: {
          description:
            "Note:\nThis is a Foreign Key to `personal_report.id`.<fk table='personal_report' column='id'/>",
        },
        status: {},
      },
    },
    personal_report: { properties: { id: { description: "<pk/>" } } },
    brain_chunk: { properties: { id: { description: "<pk/>" } } },
    ap_team_user: { properties: { email: {} } },
  },
};

describe("parseOpenApi", () => {
  it("reads columns, primary keys, foreign keys and the table comment", () => {
    const schema = parseOpenApi(doc);
    const payment = schema.get("payment");
    expect(payment?.columns.map((c) => c.name)).toEqual(["id", "personal_report_id", "status"]);
    expect(payment?.columns[0]?.pk).toBe(true);
    expect(payment?.fks).toEqual([
      { column: "personal_report_id", table: "personal_report", target: "id" },
    ]);
    expect(payment?.note).toBe("Money in. One row per Stripe session.");
  });

  it("refuses a document with no definitions instead of writing an empty page", () => {
    expect(() => parseOpenApi({})).toThrow(/no definitions/);
  });
});

describe("areaOf", () => {
  /**
   * The narrow prefixes must win: report_session is an event log and report_price_quote is a
   * price, even though both start with "report".
   */
  it("puts the look-alike names in the right area", () => {
    expect(areaOf("report_session")).toBe("Events and analytics");
    expect(areaOf("report_price_quote")).toBe("Payments and prices");
    expect(areaOf("personal_report_section")).toBe("Reports");
    expect(areaOf("payment_webhook_event")).toBe("Payments and prices");
    expect(areaOf("app_user")).toBe("Survey and scoring");
    expect(areaOf("ap_team_user")).toBe("Admin and AP-Analytics");
    expect(areaOf("brain_chunk")).toBe("Company brain");
    expect(areaOf("cron_run")).toBe("Operations");
  });
});

describe("firstSentence", () => {
  it("keeps one sentence and removes characters that break a table cell", () => {
    expect(firstSentence("One row per `answer` | ever. Second sentence.")).toBe(
      "One row per answer  ever."
    );
    expect(firstSentence("x".repeat(200), 20)).toBe(`${"x".repeat(17)}...`);
  });
});

describe("findViews", () => {
  it("finds views and materialized views, with or without the schema prefix", () => {
    const views = findViews([
      "CREATE OR REPLACE VIEW public.ap_team_user AS select 1;",
      'create materialized view if not exists "admin_submission_facts" as select 1;',
      "create table payment (id int);",
    ]);
    expect([...views].sort()).toEqual(["admin_submission_facts", "ap_team_user"]);
  });
});

describe("coreFlow", () => {
  it("draws only the foreign keys that stay between core tables", () => {
    const schema = parseOpenApi(doc);
    schema.get("payment")?.fks.push({ column: "user_id", table: "app_user", target: "id" });
    const flow = coreFlow(schema, ["payment", "personal_report"]);
    expect(flow).toBe("flowchart LR\n  payment -->|personal_report_id| personal_report");
  });
});

describe("render", () => {
  it("lists areas in order, marks views and counts what it shows", () => {
    const md = render(parseOpenApi(doc), { date: "2026-10-27", views: new Set(["ap_team_user"]) });
    expect(md).toContain("**Generated:** 2026-10-27");
    expect(md).toContain("4 relations, 6 columns, 1 foreign keys");
    expect(md).toContain("| `ap_team_user` (view) | 1 |  |  |");
    // The table comment has two sentences. The page keeps the first.
    expect(md).toContain("| `payment` | 3 | `personal_report` | Money in. |");
    expect(md.indexOf("## Reports")).toBeLessThan(md.indexOf("## Payments and prices"));
    expect(md).toContain("```mermaid\nflowchart LR");
  });
});
