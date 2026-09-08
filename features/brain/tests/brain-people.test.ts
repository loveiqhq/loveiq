import { describe, expect, it } from "vitest";

import { peopleIn, type Person } from "@features/brain/server/people";

/** The shape `loadPeople` returns: every alias, lower-cased, pointing at one person. */
function registry(entries: Array<[string, string[], Person["kind"]]>): Map<string, Person> {
  const m = new Map<string, Person>();
  for (const [canonical, aliases, kind] of entries) {
    const p: Person = { canonical, kind };
    m.set(canonical.toLowerCase(), p);
    for (const a of aliases) m.set(a.toLowerCase(), p);
  }
  return m;
}

const REG = registry([
  ["Eman Cickusic", ["Eman", "ec@loveiq.org", "eman.cickusic@loveiq.org"], "person"],
  ["Iman Beslija", ["Iman", "iman.beslija"], "person"],
  ["Marcus Börner", ["Marcus", "mb@loveiq.org"], "person"],
  ["Mark Oldenburg", ["Mark", "mo@loveiq.org"], "person"],
  ["dependabot", ["dependabot[bot]"], "bot"],
  ["teamwork (shared mailbox)", ["teamwork@loveiq.org"], "shared"],
]);

describe("peopleIn — one name for a person, whatever the source called them", () => {
  it("resolves a commit author", () => {
    expect(peopleIn({ author: "Eman Cickusic" }, REG)).toEqual(["Eman Cickusic"]);
  });

  it("resolves an email address to the same person as their display name", () => {
    expect(peopleIn({ owner: "ec@loveiq.org" }, REG)).toEqual(["Eman Cickusic"]);
  });

  it("splits Notion's comma-joined assignees", () => {
    // Notion writes several assignees into one string; treating it as a single value
    // matched nothing at all, which is how a task with two owners had none.
    expect(peopleIn({ assignee: "Mark Oldenburg, Eman Cickusic" }, REG)).toEqual([
      "Eman Cickusic",
      "Mark Oldenburg",
    ]);
  });

  it("reads both halves of a 'Name <email>' participant", () => {
    expect(peopleIn({ participants: ['"Marcus Börner" <mb@loveiq.org>'] }, REG)).toEqual([
      "Marcus Börner",
    ]);
  });

  it("collects across several identity fields at once and de-duplicates", () => {
    expect(peopleIn({ author: "Eman", speakers: ["Eman Cickusic", "Marcus"] }, REG)).toEqual([
      "Eman Cickusic",
      "Marcus Börner",
    ]);
  });

  it("is case-insensitive, because sources disagree about capitalisation", () => {
    expect(peopleIn({ author: "EMAN CICKUSIC" }, REG)).toEqual(["Eman Cickusic"]);
  });

  /**
   * THE MERGE THAT WOULD HAVE BEEN WRONG.
   *
   * "Eman" and "Iman" differ by one letter and looked like one person spelled two ways.
   * They appear TOGETHER in 11 WhatsApp bursts, which one person renamed cannot do, and
   * `iman.beslija` exists separately in the issue tracker. Fusing them would have merged
   * two colleagues' histories — and nothing at the point of use would reveal it.
   */
  it("keeps near-identical names apart", () => {
    expect(peopleIn({ speakers: ["Eman", "Iman"] }, REG)).toEqual([
      "Eman Cickusic",
      "Iman Beslija",
    ]);
    expect(peopleIn({ author: "Iman" }, REG)).toEqual(["Iman Beslija"]);
  });

  /**
   * "Ema" IS A PREFIX OF "Eman", AND THEY ARE DIFFERENT COLLEAGUES.
   *
   * Ema Djedović and Eman Cickusic both appear in this corpus — Ema owns 5,119 Drive
   * chunks. Any prefix or substring matching fuses the larger history into the smaller
   * name, and nothing downstream would show it: the chunk would simply be attributed to
   * the wrong person forever. Lookup is an exact map hit, and this pins it.
   */
  it("does not match a name that is merely a prefix of a real alias", () => {
    const reg = registry([
      ["Eman Cickusic", ["Eman", "ec@loveiq.org"], "person"],
      ["Ema Djedovic", ["ema.djedovic@loveiq.org"], "person"],
    ]);
    // "Ema" is a prefix of "Eman" and of "ema.djedovic@..." and is an alias of neither.
    expect(peopleIn({ author: "Ema" }, reg)).toBeUndefined();
    // The full alias still resolves, so this is exactness and not a broken lookup.
    expect(peopleIn({ owner: "ema.djedovic@loveiq.org" }, reg)).toEqual(["Ema Djedovic"]);
    expect(peopleIn({ author: "Eman" }, reg)).toEqual(["Eman Cickusic"]);
  });

  it("keeps Mark and Marcus apart", () => {
    expect(peopleIn({ speakers: ["Mark"] }, REG)).toEqual(["Mark Oldenburg"]);
    expect(peopleIn({ speakers: ["Marcus"] }, REG)).toEqual(["Marcus Börner"]);
  });

  /**
   * A robot authors many commit chunks and a shared mailbox owns thousands of Drive
   * chunks. Counting either as a colleague makes "who has written the most" answer with
   * dependabot.
   */
  it("excludes bots and shared mailboxes", () => {
    expect(peopleIn({ author: "dependabot[bot]" }, REG)).toBeUndefined();
    expect(peopleIn({ owner: "teamwork@loveiq.org" }, REG)).toBeUndefined();
  });

  it("still finds the humans in a mixed list", () => {
    expect(peopleIn({ participants: ["dependabot[bot]", "Marcus"] }, REG)).toEqual([
      "Marcus Börner",
    ]);
  });

  /**
   * UNDEFINED, NOT EMPTY, and the difference is load-bearing. An empty array asserts
   * "nobody here". A registry that failed to load would then strip the field from every
   * chunk in the run and read as a corpus in which nobody wrote anything.
   */
  it("returns undefined when the registry could not be read", () => {
    expect(peopleIn({ author: "Eman Cickusic" }, null)).toBeUndefined();
  });

  it("returns undefined when nobody in the registry matches", () => {
    expect(peopleIn({ author: "Someone Not In The Registry" }, REG)).toBeUndefined();
  });

  it("ignores identity fields that are not strings", () => {
    expect(peopleIn({ author: 42, speakers: [7, null] } as never, REG)).toBeUndefined();
  });

  it("reads nothing from a chunk with no identity fields at all", () => {
    expect(peopleIn({ grain: "day", channel: "all-loveiq" }, REG)).toBeUndefined();
  });
});
