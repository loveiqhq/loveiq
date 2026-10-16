import { describe, expect, it } from "vitest";
import { hogqlCodeOnly, hogqlShape } from "@features/ux-review/server/review";

describe("hogqlCodeOnly — the code of a query, without its strings and comments", () => {
  it("blanks strings, quoted names and comments, keeping every position", () => {
    const q = "SELECT 'a -- b' AS `x y`, \"z\" /* LIMIT 9 */ FROM t -- LIMIT 5\nLIMIT 3";
    const code = hogqlCodeOnly(q);
    expect(code).toHaveLength(q.length);
    expect(code).not.toMatch(/LIMIT 9|LIMIT 5|a -- b|x y/);
    expect(code).toMatch(/LIMIT 3$/);
  });

  it("does not end a string at an escaped quote", () => {
    expect(hogqlCodeOnly("SELECT 'it\\'s UNION' AS s")).not.toContain("UNION");
  });
});

describe("hogqlShape — how a caller's query is capped", () => {
  it.each([
    ["SELECT 1", null],
    ["SELECT 1 LIMIT 5", 5],
    ["select 1 limit 5", 5],
    ["SELECT 1 LIMIT 5 OFFSET 10", 5],
    ["SELECT 1 LIMIT 10, 5", 5],
    ["SELECT 1 LIMIT 5;", 5],
    ["SELECT 1 LIMIT 5 -- top five", 5],
    ["SELECT 1 -- LIMIT 5", null],
    ["SELECT a FROM (SELECT 1 AS a LIMIT 5)", null],
    ["SELECT 1 LIMIT 1 BY x", null],
  ])("%s has its own LIMIT %s", (query, limit) => {
    expect(hogqlShape(query).ownLimit).toBe(limit);
  });

  it("cuts a trailing semicolon and comment from the body, nothing else", () => {
    expect(hogqlShape("SELECT 1 AS n ; -- done").body).toBe("SELECT 1 AS n");
    expect(hogqlShape("SELECT ';' AS s").body).toBe("SELECT ';' AS s");
  });

  it("keeps a string or quoted name the query ends with", () => {
    const q = "SELECT count() FROM events WHERE event = '$pageview'";
    expect(hogqlShape(q).body).toBe(q);
    expect(hogqlShape(`${q};`).body).toBe(q);
    expect(hogqlShape("SELECT 1 FROM `events`").body).toBe("SELECT 1 FROM `events`");
  });

  it.each([
    ["SELECT 1 UNION ALL SELECT 2", "UNION"],
    ["SELECT 1 INTERSECT SELECT 1", "INTERSECT"],
    ["SELECT 1 EXCEPT SELECT 2", "EXCEPT"],
    ["SELECT * FROM (SELECT 1 UNION ALL SELECT 2)", null],
    ["SELECT 'UNION' AS u", null],
    ["SELECT 1 AS union_count", null],
  ])("%s → set operation at the top level: %s", (query, op) => {
    expect(hogqlShape(query).setOperation).toBe(op);
  });
});

describe("hogqlShape — the tables a query reads", () => {
  it.each([
    ["SELECT 1 FROM events", ["events"]],
    ["SELECT 1 FROM events AS e JOIN persons p ON p.id = e.person_id", ["events", "persons"]],
    ["SELECT 1 FROM events, stripe_charge", ["events", "stripe_charge"]],
    ["SELECT 1 FROM events e, `postgres_payment` p", ["events", "postgres_payment"]],
    ['SELECT 1 FROM "postgres_waitlist_user"', ["postgres_waitlist_user"]],
    ["SELECT 1 FROM (SELECT 2 FROM sessions)", ["sessions"]],
    ["SELECT 1 FROM events ARRAY JOIN properties.tags AS tag", ["events"]],
    ["SELECT 'FROM postgres_payment' AS s FROM events", ["events"]],
    ["SELECT 1 FROM events -- JOIN postgres_payment", ["events"]],
    ["SELECT 1 FROM postgres.survey_submission", ["postgres.survey_submission"]],
  ])("%s reads %j", (query, tables) => {
    expect(hogqlShape(query).tables).toEqual(tables);
  });

  it("knows the names a WITH gives", () => {
    expect(hogqlShape("WITH a AS (SELECT 1 FROM events) SELECT * FROM a").ctes).toEqual(["a"]);
    expect(hogqlShape("WITH 1 AS x SELECT x FROM events").ctes).toEqual([]);
  });
});
