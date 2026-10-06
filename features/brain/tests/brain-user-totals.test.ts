/**
 * Anonymous totals about our users (features/brain/server/user-totals.ts). The promise is
 * that no number shown describes fewer than five people, including by subtraction, and that
 * "paid" means what the recorded definition says.
 */
import { describe, expect, it, vi } from "vitest";
import {
  cell,
  loadPeople,
  onePerPerson,
  quartiles,
  renderAnswers,
  renderEmails,
  renderTotals,
  renderTraits,
  toPerson,
  type Person,
} from "@features/brain/server/user-totals";

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

describe("onePerPerson", () => {
  it("counts someone who finished twice once: first month, latest answers, payments added", () => {
    const merged = onePerPerson([
      person({ userId: "u1", month: "2026-08", archetype: "Old", sales: 1, revenue: 29 }),
      person({ userId: "u2" }),
      person({ userId: "u1", month: "2026-09", archetype: "New", sales: 1, revenue: 9.99 }),
      person({}),
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({
      month: "2026-08",
      archetype: "New",
      sales: 2,
      revenue: 38.99,
    });
  });

  it("keeps a sale with the archetype it was paid under, not a later unpaid retake's", () => {
    const [paidThenRetook] = onePerPerson([
      person({ userId: "u1", archetype: "Paid As", sales: 1, revenue: 29 }),
      person({ userId: "u1", archetype: "Retook As" }),
    ]);
    expect(paidThenRetook).toMatchObject({ archetype: "Paid As", sales: 1 });
    const [retookThenPaid] = onePerPerson([
      person({ userId: "u2", archetype: "First" }),
      person({ userId: "u2", archetype: "Paid As", sales: 1, revenue: 29 }),
    ]);
    expect(retookThenPaid).toMatchObject({ archetype: "Paid As" });
  });

  it("stops one repeat finisher from filling a group on their own", () => {
    const text = renderTotals(
      { groupBy: [], filter: {} },
      onePerPerson(Array.from({ length: 6 }, () => person({ userId: "same" })))
    );
    expect(text).toMatch(/^Fewer than 5 people finished/);
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
    expect(text).toContain("- 5 more people, in groups too small to show on their own.");
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
    expect(text).toContain("- 7 more people, in groups too small to show on their own.");
  });

  it("shows only the total when one of two groups is small, since the other would give it away", () => {
    const text = renderTotals({ groupBy: ["gender"], filter: {} }, [
      ...many(7, { gender: "Woman" }),
      ...many(2, { gender: "Man" }),
    ]);
    expect(text).toContain("- All: 9 finished");
    expect(text).not.toMatch(/Woman:|Man:/);
    expect(text).toContain("- 9 more people, in groups too small to show on their own.");
  });

  it("keeps hiding while the hidden groups add up to fewer than five, and never counts them", () => {
    // "2 more people, in 2 groups" beside a total with 1 paid and two visible rows with
    // none said: two people alone in their groups, and one of them paid EUR 29.
    const people = [
      ...many(12, { gender: "Woman" }),
      ...many(9, { gender: "Man" }),
      person({ gender: "Nonbinary", sales: 1, revenue: 29 }),
      person({ gender: "Other" }),
    ];
    const text = renderTotals({ groupBy: ["gender"], filter: {} }, people);
    expect(text).toContain("- Woman: 12 finished");
    expect(text).not.toMatch(/Man:|Nonbinary|Other:/);
    expect(text).toContain("- 11 more people, in groups too small to show on their own.");
    expect(text).not.toMatch(/in \d+ groups/);
  });

  it("matches a filter written the way the survey writes it", () => {
    const text = renderTotals({ groupBy: [], filter: { age: "25–34" } }, many(6, { age: "25-34" }));
    expect(text).toContain("- All: 6 finished");
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

describe("the other measures: traits, emails and answers", () => {
  const base = {
    created_date_time: "2026-09-10T12:00:00Z",
    age: [{ answer_option: { option_text: "25–34" } }],
    personal_report: { payment: [] },
  };
  const profile = (email: string) => ({
    email,
    user_profile: {
      gender: "Woman",
      sexual_orientation: null,
      relationship_status: "Single",
      location_primary: "Canada",
    },
  });
  const req = (over: Partial<Parameters<typeof renderTotals>[0]> = {}) => ({
    groupBy: [],
    filter: {},
    ...over,
  });
  const traits = (v: number) => ({ DIM_SACRED: v, DIM_NOVELTY: 1 - v });

  it("reads traits as numbers only, reminders across every quote, and mail facts by email", () => {
    const mail = {
      suppressed: new Map([
        ["a@example.com", { reason: "unsubscribed", campaign: "72h_no_unlock" }],
        ["b@example.com", { reason: "hard_bounce", campaign: null }],
      ]),
      inviters: new Set(["a@example.com"]),
    };
    const p = toPerson(
      {
        ...base,
        app_user: profile("A@Example.com "),
        scoring_result: {
          v5_primary_archetype: "Spark Seeker",
          primary_archetype: null,
          uDimensions: { DIM_SACRED: 0.5, DIM_NOVELTY: "high", DIM_EDGE_NEED: Number.NaN },
        },
        report_price_quote: [
          { reminders: ["72h_no_unlock"] },
          { reminders: null },
          { reminders: ["72h_no_unlock", "30h_no_unlock"] },
        ],
      },
      mail
    )!;
    expect(p.traits).toEqual({ DIM_SACRED: 0.5 });
    expect(p.reminders).toEqual(["72h_no_unlock", "30h_no_unlock"]);
    expect(p).toMatchObject({ unsubscribedFrom: "72h_no_unlock", invited: true });
    const b = toPerson(
      { ...base, app_user: profile("b@example.com"), scoring_result: null },
      mail
    )!;
    expect(b).toMatchObject({ bounced: true });
    expect(b.unsubscribedFrom).toBeUndefined();
  });

  it("reads the options people picked and a scale's number, never what they wrote", () => {
    const answered = (answer: unknown) =>
      toPerson({
        ...base,
        app_user: profile("c@example.com"),
        scoring_result: null,
        answer: answer as never,
      })!.answer;
    expect(
      answered([
        {
          normalized_value: null,
          answer_option: { option_text: "Mostly safe" },
          survey_submission_answer_options: [],
        },
      ])
    ).toEqual(["Mostly safe"]);
    expect(
      answered([
        {
          normalized_value: null,
          answer_option: null,
          survey_submission_answer_options: [
            { answer_option: { option_text: "More pleasure" } },
            { answer_option: { option_text: "Something else" } },
          ],
        },
      ])
    ).toEqual(["More pleasure", "Something else"]);
    expect(
      answered([{ normalized_value: 6, answer_option: null, survey_submission_answer_options: [] }])
    ).toEqual(["6"]);
    // A written-in answer arrives, if it ever does, as answer_text: it must count as nothing.
    expect(
      answered([
        {
          normalized_value: null,
          answer_option: null,
          survey_submission_answer_options: [],
          answer_text: "my private words",
        },
      ])
    ).toBeUndefined();
  });

  it("reads one question's answers, and never the written text, in the query itself", async () => {
    vi.resetModules();
    const paths: string[] = [];
    vi.doMock("@features/admin/server/supabase", () => ({
      supabaseFetch: async (path: string) => {
        paths.push(path);
        return { ok: true, status: 200, json: async () => [{ id: 41 }] };
      },
    }));
    vi.doMock("@features/brain/server/read-all", () => ({
      readAll: async (path: string) => {
        paths.push(path);
        return [];
      },
    }));
    const mod = await import("@features/brain/server/user-totals");
    await mod.loadPeople("2026-09-01", "2026-09-30", { measure: "answers", questionId: 77 });
    const main = paths.find((p) => p.startsWith("/rest/v1/survey_submission"))!;
    expect(main).toContain("&answer.survey_question_id=eq.77");
    expect(main).toContain("&age.survey_question_id=eq.41");
    expect(main).not.toContain("answer_text");
    vi.doUnmock("@features/admin/server/supabase");
    vi.doUnmock("@features/brain/server/read-all");
    expect(typeof loadPeople).toBe("function");
  });

  it("files a paying user's traits and answers with the finish they paid under", () => {
    const [p] = onePerPerson([
      person({
        userId: "u1",
        archetype: "Spark Seeker",
        sales: 1,
        traits: { DIM_SACRED: 0.2 },
        answer: ["No"],
      }),
      person({
        userId: "u1",
        archetype: "Spiritual Lover",
        traits: { DIM_SACRED: 0.9 },
        answer: ["Yes"],
      }),
    ]);
    expect(p).toMatchObject({
      archetype: "Spark Seeker",
      traits: { DIM_SACRED: 0.2 },
      answer: ["No"],
    });
    // Without a sale, the latest finish sets all three.
    const [q] = onePerPerson([
      person({ userId: "u2", archetype: "Spark Seeker", traits: { DIM_SACRED: 0.2 } }),
      person({
        userId: "u2",
        archetype: "Spiritual Lover",
        traits: { DIM_SACRED: 0.9 },
        reminders: ["x"],
      }),
    ]);
    expect(q).toMatchObject({ archetype: "Spiritual Lover", traits: { DIM_SACRED: 0.9 } });
  });

  it("shows a count inside a group only when it and the rest are five or more, zero included", () => {
    expect(cell(0, 30)).toBe("under 5");
    expect(cell(4, 30)).toBe("under 5");
    expect(cell(5, 30)).toBe("5");
    expect(cell(26, 30)).toBe("all but under 5");
    expect(cell(30, 30)).toBe("all but under 5");
    expect(cell(25, 30)).toBe("25");
  });

  it("works out the middle half between people, not on one person's value", () => {
    expect(quartiles([0, 10, 20, 30, 40])).toEqual([10, 30]);
    expect(quartiles([1, 2, 3, 4])).toEqual([1.75, 3.25]);
  });

  it("shows no trait averages under twenty people, and every trait with its middle half from twenty", () => {
    expect(renderTraits(req(), many(19, { traits: traits(0.5) }))).toMatch(/^Fewer than 20 people/);
    const spread = Array.from({ length: 20 }, (_, i) => person({ traits: traits(i / 19) }));
    const text = renderTraits(req(), spread);
    expect(text).toContain("20 people with a scored report");
    expect(text).toMatch(/Sex as sacred\/meaningful\/ritual: 50 \(middle half 25 to 75\)/);
  });

  it("averages a trait only when twenty people have it, whatever the others have", () => {
    const people = [
      ...many(15, { traits: { DIM_SACRED: 0.4 } }),
      ...many(5, { traits: { DIM_SACRED: 0.6, DIM_NOVELTY: 0.9 } }),
    ];
    const text = renderTraits(req(), people);
    expect(text).toContain("Sex as sacred/meaningful/ritual");
    expect(text).not.toContain("Crave novelty");
  });

  it("hides the same groups as the people measure, and withholds averages for a small shown group", () => {
    const people = [
      ...many(40, { archetype: "Spark Seeker", traits: traits(0.2) }),
      ...many(6, { archetype: "Tender Devotee", traits: traits(0.9) }),
      // Finished but not scored: still part of everyone's groups.
      ...many(3, { archetype: "not scored" }),
    ];
    const byArchetype = req({ groupBy: ["archetype"] });
    const shownIn = (text: string) =>
      ["Spark Seeker", "Tender Devotee", "not scored"].filter((a) => text.includes(`- ${a}`));
    const counts = renderTotals(byArchetype, people);
    const profile = renderTraits(byArchetype, people);
    expect(shownIn(profile)).toEqual(shownIn(counts));
    expect(profile).toContain("9 more people, in groups too small");
    // Everyone's 46 averages minus the 40's would give the 6 hidden Tender Devotees' averages.
    expect(profile).toContain(
      "- Spark Seeker: averages withheld, so a smaller group cannot be worked out"
    );
    // With nobody scored left over, both groups are averaged.
    const clean = [
      ...many(40, { archetype: "Spark Seeker", traits: traits(0.2) }),
      ...many(25, { archetype: "Tender Devotee", traits: traits(0.9) }),
    ];
    const both = renderTraits(byArchetype, clean);
    expect(both).toMatch(/- Spark Seeker \(40 people\): most above/);
    expect(both).toMatch(/- Tender Devotee \(25 people\): most above/);
    // A group big enough to show, but with fewer than twenty scored reports, is shown bare.
    const eight = [
      ...many(40, { archetype: "Spark Seeker", traits: traits(0.2) }),
      ...many(8, { archetype: "Tender Devotee", traits: traits(0.9) }),
    ];
    expect(renderTraits(byArchetype, eight)).toContain(
      "- Tender Devotee: fewer than 20 scored reports, so no averages."
    );
  });

  it("counts emails with small counts hidden, names only our own campaigns, and says what is not logged", () => {
    const people = [
      ...many(3, { reminders: ["72h_no_unlock"], unsubscribedFrom: "72h_no_unlock" }),
      // An unsigned ?src= can carry any slug: it must never be printed as if it were ours.
      ...many(12, { reminders: ["72h_no_unlock"], unsubscribedFrom: "planted_label" }),
      ...many(15, { bounced: true, invited: true }),
    ];
    const text = renderEmails(req(), people, {
      counts: { "email.sent": 40, "email.delivered": 38, "email.clicked": 3 },
      recordedFrom: "2026-09-14",
    });
    expect(text).toContain("report reminders recorded: Nurture 72h (50% off) 15");
    expect(text).toContain('unsubscribed 15 (50%), most from "another email"');
    expect(text).not.toContain("planted_label");
    expect(text).toContain("complained under 5");
    expect(text).toContain("bounced 15");
    expect(text).toContain("not logged per person");
    expect(text).toContain("before it sends");
  });

  it("names no campaign when even the most common one was under five people", () => {
    const people = [
      ...many(3, { unsubscribedFrom: "72h_no_unlock" }),
      ...many(3, { unsubscribedFrom: "survey_complete" }),
      ...many(10),
    ];
    const text = renderEmails(req(), people, null);
    expect(text).toContain("unsubscribed 6 (38%)");
    expect(text).not.toContain("most from");
  });

  it("says when Resend's record starts, and when it could not be read", () => {
    const people = many(10);
    const d = { counts: { "email.sent": 4 }, recordedFrom: "2026-09-14" };
    expect(renderEmails(req({ since: "2026-08-01", until: "2026-08-31" }), people, d)).toContain(
      "start on 2026-09-14, after these dates"
    );
    expect(renderEmails(req({ since: "2026-09-01" }), people, d)).toContain(
      "2026-09-14 to today (its record starts on 2026-09-14)"
    );
    expect(renderEmails(req(), people, null)).toContain("could not be read right now");
  });

  it("shares out the answers with small shares hidden, and a scale in order", () => {
    const scale = { id: 7, qid: "03011", type: "scale", question: "Sex feels sacred to me" };
    const people = [
      ...many(10, { answer: ["6"] }),
      ...many(6, { answer: ["2"] }),
      ...many(3, { answer: ["4"] }),
    ];
    const text = renderAnswers(req(), people, scale);
    expect(text).toContain('Answers to 03011, "Sex feels sacred to me"');
    // Every option is listed, zeros too, so a missing option cannot say nobody chose it.
    expect(text).toContain(
      "- All (19 answered): 1 under 5 · 2 32% · 3 under 5 · 4 under 5 · 5 under 5 · 6 53% · 7 under 5"
    );
    // A group of five where one person differs: one person's answer, so neither share is exact.
    const five = [...many(4, { answer: ["No"] }), person({ answer: ["Yes"] })];
    const single = { id: 8, qid: "03012", type: "single", question: "Q" };
    const small = renderAnswers(req(), five, single);
    expect(small).toContain("No under 5 · Yes under 5");
    expect(small).not.toMatch(/80%|20%/);
  });

  it("hides a second share when a row's total would give back a lone hidden one", () => {
    const single = { id: 8, qid: "03012", type: "single", question: "Q" };
    // 10 + 7 + 3 = 20: with only "C" hidden, 20 - 10 - 7 would say C is 3.
    const people = [
      ...many(10, { answer: ["A"] }),
      ...many(7, { answer: ["B"] }),
      ...many(3, { answer: ["C"] }),
    ];
    const text = renderAnswers(req(), people, single);
    expect(text).toContain("A 50% · B hidden with it · C under 5");
    // Several answers per person do not add up to the total, so nothing extra is hidden.
    const multi = { ...single, type: "multiple" };
    expect(renderAnswers(req(), people, multi)).toContain("B 35%");
  });

  it("gives only the size of everyone when grouped, for answers and emails alike", () => {
    const single = { id: 8, qid: "03012", type: "single", question: "Q" };
    const people = [
      ...many(12, { gender: "Woman", answer: ["A"], unsubscribedFrom: "72h_no_unlock" }),
      ...many(8, { gender: "Man", answer: ["B"] }),
    ];
    const byGender = req({ groupBy: ["gender"] });
    expect(renderAnswers(byGender, people, single)).toContain("- All: 20 answered\n");
    const emails = renderEmails(byGender, people, null);
    expect(emails).toContain("- All: 20 finished\n");
    expect(emails).toContain("- Woman: 12 finished");
  });

  it("says a question stored as text is not summarised, rather than that nobody answered it", () => {
    const country = {
      id: 9,
      qid: "15001",
      type: "single",
      question: "Which country do you live in?",
    };
    const text = renderAnswers(req(), many(30), country);
    expect(text).toContain("stored as written text");
    expect(text).toContain("group by country");
    const multi = { id: 10, qid: "16001", type: "multiple", question: "Q" };
    expect(renderAnswers(req(), many(5, { answer: ["A", "B"] }), multi)).toContain(
      "more than 100%"
    );
  });
});
