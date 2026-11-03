import { describe, expect, it } from "vitest";
import { glossaryTerms, type GlossaryTerm } from "@/data/glossary-data";
import {
  filterEntries,
  groupByLetter,
  toIndexEntries,
} from "@features/glossary/logic/index-entries";

const term = (name: string, extra: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id: 0,
  term: name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  type: "",
  category: "pattern",
  definition: `About ${name}.`,
  extendedNotes: "Long notes the index never needs.",
  examples: ["An example"],
  domain: "",
  sensitivityLevel: "General",
  misinterpretations: ["A myth"],
  reality: ["The reality"],
  relatedTerms: ["Something"],
  tags: ["tag"],
  ...extra,
});

describe("toIndexEntries", () => {
  it("keeps only what the index renders, searches and filters on", () => {
    const [entry] = toIndexEntries([term("Aftercare", { category: "desire" })]);
    expect(entry).toEqual({
      term: "Aftercare",
      slug: "aftercare",
      category: "desire",
      definition: "About Aftercare.",
    });
  });

  it("sorts A–Z with one collation, ignoring case", () => {
    const names = toIndexEntries([term("boundaries"), term("Consent"), term("Aftercare")]).map(
      (e) => e.term
    );
    expect(names).toEqual(["Aftercare", "boundaries", "Consent"]);
  });

  it("covers every real term and stays far below the full data's size", () => {
    const entries = toIndexEntries(glossaryTerms);
    expect(entries.map((e) => e.slug).sort()).toEqual(glossaryTerms.map((t) => t.slug).sort());
    // The full term array is ~630 KB of JSON. The slim list ships in the page's
    // payload, so a budget catches anyone passing whole terms to the client again.
    expect(JSON.stringify(entries).length).toBeLessThan(100_000);
  });
});

describe("groupByLetter", () => {
  it("groups by first letter and keeps the incoming order", () => {
    const groups = groupByLetter(
      toIndexEntries([term("Arousal"), term("Boundaries"), term("Aftercare")])
    );
    expect(Object.keys(groups)).toEqual(["A", "B"]);
    expect(groups.A!.map((e) => e.term)).toEqual(["Aftercare", "Arousal"]);
  });
});

describe("filterEntries", () => {
  const entries = toIndexEntries([
    term("Aftercare", { category: "desire", definition: "Care after intimacy." }),
    term("Boundaries", { category: "sensitive", definition: "Limits you set." }),
  ]);

  it("matches the name or the definition, ignoring case and outer spaces", () => {
    expect(filterEntries(entries, "  INTIMACY ", "all").map((e) => e.term)).toEqual(["Aftercare"]);
    expect(filterEntries(entries, "bound", "all").map((e) => e.term)).toEqual(["Boundaries"]);
  });

  it("filters by group, and an empty query keeps the whole group", () => {
    expect(filterEntries(entries, "", "sensitive").map((e) => e.term)).toEqual(["Boundaries"]);
    expect(filterEntries(entries, "", "all")).toHaveLength(2);
    expect(filterEntries(entries, "care", "sensitive")).toEqual([]);
  });
});
