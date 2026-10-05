import type { InstrumentDefinition, SignOff } from "./types";

/**
 * What the validators sign for every instrument, in this order. The first lines are about
 * being faithful to the published form; the rest about our part: the copy, the next steps
 * and the safety routing. The gate refuses `validated` unless exactly these lines are signed.
 */
export function standardSignOff(
  def: Pick<InstrumentDefinition, "safety" | "form" | "bandsFrom">
): SignOff[] {
  return [
    { check: "The item wording matches the published form word for word." },
    { check: "The answer options and the timeframe match the published form." },
    ...(def.form.adaptation
      ? [{ check: `The adaptation from the published form is acceptable: ${def.form.adaptation}` }]
      : []),
    { check: "Scoring (sum or mean, reversed items, unscored items) matches the manual." },
    def.bandsFrom === "source"
      ? { check: "The band ranges and their labels match the cited source." }
      : { check: "The source gives no bands; our ranges and labels are acceptable for screening." },
    {
      check:
        "The license allows commercial digital use, our use (people taking it on their own) fits its terms, and the credit line is right.",
    },
    def.safety?.length
      ? {
          check:
            "The safety routing is right: what triggers it, what it says, the next step it gives, and the help lines for each country.",
        }
      : { check: "No item in this instrument needs safety routing." },
    {
      check:
        "Each band's summary is accurate, calm and plain, and reads as screening, not diagnosis.",
    },
    { check: "Each band's next step is appropriate for someone with that score." },
  ];
}
