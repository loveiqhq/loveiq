/**
 * Anonymous totals about our users (features/brain/server/user-totals.ts). The promise is
 * that no number shown describes fewer than five people, including by subtraction, and that
 * "paid" means what the recorded definition says.
 */
import { describe, expect, it } from "vitest";
import { renderTotals, toPerson, type Person } from "@features/brain/server/user-totals";

const person = (over: Partial<Person> = {}): Person => ({
  gender: "Woman",
  age: "25-34",
  orientation: "Straight",
  relationship: "Single",
  country: "United States",
  archetype: "Spiritual Lover",
  month: "2026-09",
  revenue: 0,
  sales: 0,
  otherCurrency: 0,
  comps: 0,
  ...over,
});
const many = (count: number, over: Partial<Person> = {}) =>
  Array.from({ length: count }, () => person(over));

describe("toPerson", () => {
  const row = (payments: Array<Record<string, unknown>>, email = "someone@example.com") => ({
    created_date_time: "2026-09-10T12:00:00Z",
    age: [{ answer_option: { option_text: "25–34" } }],
    app_user: {
      email,
      user_profile: {
        gender: "I’d rather not label this",
        sexual_orientation: null,
        relationship_status: "Married",
        location_primary: "Canada",
      },
    },
    scoring_result: { v5_primary_archetype: "Loyal Ritualist", primary_archetype: "Other" },
    personal_report: { payment: payments as never },
  });

  it("counts a real sale, and never a test, a failure or a free coupon unlock", () => {
    const p = toPerson(
      row([
        { amount: "29.00", currency: "EUR", status: "succeeded", is_test: false },
        { amount: "9.99", currency: "EUR", status: "succeeded", is_test: true },
        { amount: "29.00", currency: "EUR", status: "canceled", is_test: false },
        { amount: "0", currency: "EUR", status: "succeeded", is_test: false },
        { amount: "20.00", currency: "USD", status: "succeeded", is_test: false },
      ])
    )!;
    expect(p).toMatchObject({ sales: 2, revenue: 29, otherCurrency: 1, comps: 1 });
    // Both spellings of the same answer are one group, the survey's "25–34" is typed "25-34",
    // and a missing answer says so.
    expect(p).toMatchObject({
      gender: "I'd rather not label this",
      orientation: "not given",
      age: "25-34",
      archetype: "Loyal Ritualist",
      month: "2026-09",
    });
  });

  it("leaves staff out", () => {
    expect(toPerson(row([], "eman@loveiq.org"))).toBeNull();
  });
});

describe("renderTotals", () => {
  it("shows nothing at all when fewer than five people match", () => {
    const text = renderTotals({ groupBy: [], filter: { country: "Iceland" } }, [
      ...many(4, { country: "Iceland" }),
      ...many(40),
    ]);
    expect(text).toMatch(/^Fewer than 5 people finished the survey where country is Iceland/);
    expect(text).not.toMatch(/\d+ finished/);
  });

  it("hides every group under five, and says how many people that leaves out", () => {
    const people = [
      ...many(12, { gender: "Woman" }),
      ...many(9, { gender: "Man" }),
      ...many(2, { gender: "Nonbinary" }),
      ...many(3, { gender: "Other" }),
    ];
    const text = renderTotals({ groupBy: ["gender"], filter: {} }, people);
    expect(text).toContain("- All: 26 finished");
    expect(text).toContain("- Woman: 12 finished");
    expect(text).toContain("- Man: 9 finished");
    expect(text).not.toMatch(/Nonbinary|Other:/);
    expect(text).toContain("- 5 more people, in 2 groups too small to show on their own.");
  });

  it("hides the next-smallest group too when only one would be hidden, so subtraction reveals nothing", () => {
    const people = [
      ...many(12, { gender: "Woman" }),
      ...many(9, { gender: "Man" }),
      ...many(6, { gender: "Nonbinary" }),
      ...many(1, { gender: "Other" }),
    ];
    const text = renderTotals({ groupBy: ["gender"], filter: {} }, people);
    expect(text).toContain("- Woman: 12 finished");
    expect(text).toContain("- Man: 9 finished");
    expect(text).not.toContain("Nonbinary");
    expect(text).toContain("- 7 more people, in 2 groups too small to show on their own.");
  });

  it("shows only the total when one of two groups is small, since the other would give it away", () => {
    const text = renderTotals({ groupBy: ["gender"], filter: {} }, [
      ...many(7, { gender: "Woman" }),
      ...many(2, { gender: "Man" }),
    ]);
    expect(text).toContain("- All: 9 finished");
    expect(text).not.toMatch(/Woman:|Man:/);
    expect(text).toContain("- 9 more people, in 2 groups too small to show on their own.");
  });

  it("counts buyers once, prices a sale, and narrows by any key whatever its case", () => {
    const people = [
      ...many(8, { archetype: "Spark Seeker" }),
      person({ archetype: "Spark Seeker", sales: 2, revenue: 58 }),
      person({ archetype: "Spark Seeker", sales: 1, revenue: 9.99, comps: 1 }),
      ...many(20, { archetype: "Spark Seeker", gender: "Man" }),
    ];
    const text = renderTotals(
      { groupBy: ["archetype"], filter: { gender: "woman" }, since: "2026-09-01" },
      people
    );
    expect(text).toContain("Survey finishers where gender is woman, 2026-09-01 to today.");
    expect(text).toContain(
      "- Spark Seeker: 10 finished · 2 paid (20.0%) · EUR 67.99, EUR 22.66 a sale"
    );
    expect(text).toContain("1 free unlock with a coupon is not counted as paid");
  });

  it("orders months in time, and other groups largest first", () => {
    const people = [...many(6, { month: "2026-09" }), ...many(9, { month: "2026-07" })];
    const text = renderTotals({ groupBy: ["month"], filter: {} }, people);
    expect(text.indexOf("- 2026-07")).toBeLessThan(text.indexOf("- 2026-09"));
    const byGender = renderTotals({ groupBy: ["gender"], filter: {} }, [
      ...many(6, { gender: "A" }),
      ...many(9, { gender: "B" }),
    ]);
    expect(byGender.indexOf("- B:")).toBeLessThan(byGender.indexOf("- A:"));
  });
});
