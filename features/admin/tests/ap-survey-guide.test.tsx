// @vitest-environment jsdom
/**
 * Survey 2.0's short guide in AP-Analytics: three cards and its consent, read by their own
 * function (ap_guide_facts) as ap_facts reads the intro, and taken out of the intro's consent
 * row, which ap_facts counts for every visitor.
 */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import type { IntroFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { parseGuideFacts } from "@features/admin/server/ap/guide";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";

import { factsFixture } from "./ap-fixtures";

const MIGRATION = "supabase/migrations/20261123140000_ap_guide_facts.sql";
const ROLLBACK = "supabase/rollbacks/20261123140000_ap_guide_facts_down.sql";
const DAY = "2026-11-24";

const fact = (step: string, over: Partial<IntroFact> = {}): IntroFact => ({
  day: DAY,
  step,
  n: 0,
  ms: [],
  skipped: 0,
  wentOn: 0,
  left: 0,
  direct: 0,
  ...over,
});

// A day with both: 10 visitors saw the intro, 8 of them reached the consent; 20 saw the guide,
// 12 of them reached the consent; 3 came straight from the landing card.
const intro: IntroFact[] = [
  fact("intro_view", { n: 10, wentOn: 9, left: 1, ms: [4000] }),
  fact("intro_slide_1", { n: 9, wentOn: 9, ms: [5000] }),
  fact("intro_slide_2", { n: 9, wentOn: 9, ms: [5000] }),
  fact("intro_slide_3", { n: 9, wentOn: 8, left: 1, ms: [5000] }),
  fact("intro_slide_4", { n: 8, wentOn: 8, ms: [6000] }),
  // ap_facts: every consent viewer, the guide's 12 and the landing card's 3 counted as direct.
  fact("consent_view", {
    n: 23,
    wentOn: 19,
    left: 4,
    direct: 15,
    ms: [1000, 2000, 3000, 9000, 9000, 9000],
  }),
  fact("consent_back", { n: 2 }),
  fact("survey_engine_mount", { n: 22 }),
];
const guide: IntroFact[] = [
  fact("guide_card_1", { n: 20, wentOn: 16, left: 2, ms: [7000, 9000] }),
  fact("guide_skip_1", { n: 2 }),
  fact("guide_card_2", { n: 16, wentOn: 13, left: 2, ms: [6000] }),
  fact("guide_back_2", { n: 1 }),
  fact("guide_card_3", { n: 14, wentOn: 12, left: 1, ms: [5000] }),
  fact("guide_skip_2", { n: 1 }),
  fact("consent_view", { n: 12, wentOn: 10, left: 2, ms: [9000, 9000, 9000] }),
  fact("consent_back", { n: 1 }),
  fact("survey_engine_mount", { n: 10 }),
];

const page = (g: IntroFact[] | null) =>
  buildSurveyPage({
    facts: factsFixture({ from: DAY, to: DAY, intro }),
    previous: null,
    benchmark: factsFixture(),
    benchmarkKind: "all",
    filters: parseFilters({ period: "custom", from: DAY, to: DAY }, "2026-11-25"),
    today: "2026-11-25",
    now: new Date("2026-11-25T10:00:00Z"),
    questions: null,
    questionsError: null,
    introClicks: null,
    guide: g,
  });

describe("ap_guide_facts, the guide's reader", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("is the service role's alone, and reads only the guide's visitors", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ap_guide_facts\(p_from date, p_to date\)/
    );
    expect(sql).toMatch(/STABLE SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.ap_guide_facts\(date, date\) FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ap_guide_facts\(date, date\) TO service_role;/
    );
    expect(sql).toMatch(/event_type IN \('guide_card_1', 'guide_card_2', 'guide_card_3'\)/);
  });

  it("follows the intro's rules: Skip on the last card is no going on, a Back counts before question 1", () => {
    expect(sql).toMatch(/s3\.event_type = 'guide_skip_3'/);
    expect(sql).toMatch(
      /f\.event_type IN \('guide_back_2', 'guide_back_3', 'consent_back'\)[\s\S]*qb\.event_type = 'survey_engine_mount'/
    );
    expect(readFileSync(ROLLBACK, "utf8")).toMatch(
      /DROP FUNCTION IF EXISTS public\.ap_guide_facts\(date, date\);/
    );
  });

  it("is parsed into the intro's rows", () => {
    expect(
      parseGuideFacts([
        { day: DAY, step: "guide_card_1", n: 20, ms: [7000, "9000"], wentOn: 16, left: 2 },
        { day: DAY, step: "guide_skip_1", n: 2, ms: [], wentOn: 0, left: 0 },
      ])
    ).toEqual([
      fact("guide_card_1", { n: 20, ms: [7000, 9000], wentOn: 16, left: 2 }),
      fact("guide_skip_1", { n: 2 }),
    ]);
    expect(parseGuideFacts(null)).toEqual([]);
  });
});

describe("the short guide on the Survey page", () => {
  it("is a table of its own: three cards and its consent", () => {
    const cards = page(guide).guide!.cards;
    expect(cards.map((c) => c.step)).toEqual([
      "guide_card_1",
      "guide_card_2",
      "guide_card_3",
      "consent_view",
    ]);
    expect(cards[0]).toMatchObject({
      name: "Card 1 · Three rules to increase your report quality",
      reached: 20,
      reachedShare: 1,
      cont: 16 / 20,
      skip: 2 / 20,
      back: null,
      exit: 2 / 20,
      medianMs: 8000,
    });
    expect(cards[1]).toMatchObject({ reached: 16, back: 1 / 16, skip: 1 / 16, cont: 13 / 16 });
    expect(cards[3]).toMatchObject({
      name: "Consent · Before we begin",
      reached: 12,
      reachedShare: 12 / 20,
      cont: 10 / 12,
      back: 1 / 12,
      exit: 2 / 12,
    });
  });

  it("is not there for a range without the guide", () => {
    expect(page(null).guide).toBeNull();
    expect(page([]).guide).toBeNull();
  });

  it("leaves the intro's consent row to the intro's and the landing card's visitors", () => {
    const consent = page(guide).intro.cards.find((c) => c.step === "consent_view")!;
    // 23 consent viewers less the guide's 12; of them 3 came from the landing card.
    expect(consent.reached).toBe(11);
    expect(consent.reachedShare).toBe(8 / 10);
    expect(consent.cont).toBe(9 / 11);
    expect(consent.exit).toBe(2 / 11);
    expect(consent.back).toBe(1 / 11);
    expect(consent.medianMs).toBe(2000);
    // Without the guide's rows, ap_facts' row stands as it is.
    expect(page(null).intro.cards.find((c) => c.step === "consent_view")!.reached).toBe(23);
  });
});

const payload = page(guide);
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data: url === "/api/admin/ap/survey" ? payload : null,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

describe("the Survey page's short guide section", () => {
  it("lists the guide's cards in a table of their own", () => {
    render(<ApSurvey />);
    const table = screen.getByRole("table", { name: "Short guide cards" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual([
      expect.stringContaining("Card 1 · Three rules to increase your report quality"),
      expect.stringContaining("Card 2 · Answer from the perspective of today"),
      expect.stringContaining("Card 3 · Your Privacy Matters"),
      expect.stringContaining("Consent · Before we begin"),
    ]);
  });

  it("exports the guide's cards", () => {
    render(<ApSurvey />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const section = exported.sections.find((s) => s.name === "Short guide (Survey 2.0)");
    expect(section?.table.rows.map((r) => r.label)).toEqual([
      "1 · Card 1 · Three rules to increase your report quality",
      "2 · Card 2 · Answer from the perspective of today",
      "3 · Card 3 · Your Privacy Matters",
      "4 · Consent · Before we begin",
    ]);
  });
});
