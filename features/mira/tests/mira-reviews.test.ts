import { beforeEach, describe, expect, it } from "vitest";
import {
  REVIEWS_MIN_PEOPLE,
  forToday,
  publicReviews,
  redacted,
  type ReviewRow,
} from "@features/mira/reviews";
import { __resetStaffEmailRegexForTests } from "@shared/env/staff-email";

let next = 0;
/** A rating by a real person (not the team's, over 18), with no words unless `over` adds them. */
const row = (stars: number, over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: ++next,
  stars,
  quote_status: "none",
  published_quote: null,
  display_name: null,
  age_range: null,
  consent_at: null,
  from_team: false,
  mira_user: { email: `person${next}@example.com`, is_team: false, minor_at: null },
  ...over,
});
const approved = (stars: number, text: string, name: string, age: string | null = null) =>
  row(stars, {
    quote_status: "approved",
    published_quote: text,
    display_name: name,
    age_range: age,
    consent_at: "2026-11-22T10:00:00Z",
  });
/** `n` real people's ratings, the first with approved words. */
const crowd = (n: number, stars = 5) => [
  approved(stars, "It helped me stop hiding.", "Lea", "25-34"),
  ...Array.from({ length: n - 1 }, () => row(stars)),
];

beforeEach(() => {
  next = 0;
  delete process.env.ADMIN_TEST_EMAIL_REGEX;
  __resetStaffEmailRegexForTests();
});

describe("what Mira's pages may show of her ratings", () => {
  it("shows nothing until 20 different people have rated her", () => {
    expect(REVIEWS_MIN_PEOPLE).toBe(20);
    expect(publicReviews(crowd(19))).toBeNull();
    expect(publicReviews(crowd(20))).toEqual({
      average: 5,
      people: 20,
      quotes: [{ text: "It helped me stop hiding.", name: "Lea", age: "25–34" }],
    });
  });

  it("never counts the team's ratings, a team browser's, or an under-18's", () => {
    const user = (over: Partial<NonNullable<ReviewRow["mira_user"]>>) => ({
      email: "x@example.com",
      is_team: false,
      minor_at: null,
      ...over,
    });
    for (const odd of [
      row(1, { mira_user: user({ email: "eman@loveiq.org" }) }), // a team address
      row(1, { mira_user: user({ is_team: true }) }), // signed in from a team browser
      row(1, { from_team: true }), // rated from a team browser
      row(1, { mira_user: user({ minor_at: "2026-11-21T10:00:00Z" }) }), // said they are under 18
    ]) {
      // 19 real people and one that doesn't count: still nothing shows.
      expect(publicReviews([...crowd(19), odd])).toBeNull();
      // 20 real people: shown, and the odd one changes neither the count nor the average.
      expect(publicReviews([...crowd(20), odd])).toMatchObject({ people: 20, average: 5 });
    }
    // A team member's approved words never show either.
    const teamQuote = { ...approved(5, "Team words", "Eman"), from_team: true };
    expect(publicReviews([...crowd(20), teamQuote])?.quotes.map((q) => q.name)).toEqual(["Lea"]);
  });

  it("shows a person's words only once the team approved them, and only with their consent", () => {
    const people = Array.from({ length: 20 }, () => row(4));
    const waiting = row(4, {
      quote_status: "pending",
      display_name: "Ana",
      consent_at: "2026-11-22T10:00:00Z",
    });
    const rejected = row(4, { quote_status: "rejected" });
    // Ratings enough, but no approved words yet: nothing shows at all.
    expect(publicReviews([...people, waiting, rejected])).toBeNull();
    // Approved text without a recorded consent (the table refuses it too) is never shown.
    const unconsented = { ...approved(4, "Never shown", "Bo"), consent_at: null };
    expect(publicReviews([...people, unconsented])).toBeNull();
    const ok = approved(4, "Shown", "Cy");
    expect(publicReviews([...people, waiting, unconsented, ok])?.quotes).toEqual([
      { text: "Shown", name: "Cy", age: null },
    ]);
  });

  it("shows one quote a day, in turn, with up to three of the quoted people's initials", () => {
    const pub = {
      average: 4.8,
      people: 23,
      quotes: [
        { text: "One", name: "Lea M.", age: "25–34" },
        { text: "Two", name: "ana", age: null },
        { text: "Three", name: "Lea", age: null },
        { text: "Four", name: "Bo", age: null },
      ],
    };
    const day = (n: number) => forToday(pub, new Date(Date.UTC(2026, 10, 22 + n, 12)));
    const texts = [0, 1, 2, 3, 4].map((n) => day(n).quote.text);
    // Each in turn, then round again: four days, four quotes, the fifth day the first again.
    expect(new Set(texts.slice(0, 4)).size).toBe(4);
    expect(texts[4]).toBe(texts[0]);
    // The same all day long.
    expect(forToday(pub, new Date(Date.UTC(2026, 10, 22, 0, 1))).quote).toEqual(
      forToday(pub, new Date(Date.UTC(2026, 10, 22, 23, 59))).quote
    );
    const lea = [0, 1, 2, 3].map(day).find((d) => d.quote.text === "One")!;
    expect(lea).toEqual({
      average: 4.8,
      people: 23,
      quote: { text: "One", name: "Lea M.", age: "25–34" },
      // The quoted person first; letters only, never a name; no face twice.
      initials: ["LM", "A", "L"],
    });
  });
});

describe("the team's only edit: taking out identifying details, marked […]", () => {
  const said = "My husband Tom noticed I stopped hiding under the duvet.";

  it("allows the words as written, or with parts replaced by a visible […]", () => {
    expect(redacted(said, said)).toBe(said);
    expect(redacted(said, "My husband […] noticed I stopped hiding under the duvet.")).toBe(
      "My husband […] noticed I stopped hiding under the duvet."
    );
    // Typed with three dots, published with the one mark.
    expect(redacted(said, "[...] noticed I stopped hiding under the duvet.")).toBe(
      "[…] noticed I stopped hiding under the duvet."
    );
  });

  it("refuses any other change", () => {
    for (const edit of [
      "My husband noticed I stopped hiding under the duvet.", // a cut nobody can see
      "My husband Tom noticed I stopped hiding.", // shortened without the mark
      "My husband Tom noticed I finally stopped hiding under the duvet.", // a word added
      "My husband Tom noticed I stopped hiding under the duvet. […]", // a mark where nothing went
      "[…]", // nothing of their words left
      "My husband […][…] under the duvet.",
    ]) {
      expect(redacted(said, edit), edit).toBeNull();
    }
  });
});
