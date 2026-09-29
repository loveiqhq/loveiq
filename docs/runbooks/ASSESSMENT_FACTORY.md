# Assessment Factory

How a new psychometric instrument goes from a paper to something a person can safely take.
The code is in `features/assessments/`. The people who validate are Mark and Sanjin; which
instrument ships first is their decision too.

## The steps

1. **Pick it, and check you may use it.** Record the source (paper, DOI) and the license:
   public domain, free with a credit line, needs permission, or not checked yet. An
   instrument whose license is not checked stays a `draft`: the gate refuses anything else.
2. **Pin one published form.** Set `form` to the exact form the wording is copied from (its
   title, address and the day it was read). "Word for word" needs one referent: GAD-7 exists
   in versions whose commas and extra questions differ. If our version has to differ (an
   interview script made self-completion), say how in `form.adaptation`; it gets its own
   sign-off line.
3. **Write the definition** in `features/assessments/instruments/<id>.ts`:
   - Copy the instructions, items, answer options, scoring and band labels **word for
     word** from that form. Keep its punctuation.
   - Mark items the manual leaves out of the total as `unscored`, and reversed items as
     `reverse`. A reversed item needs answer values that are symmetric.
   - Set `bandsFrom` to `ours` when the source gives no cutoffs.
4. **Write our part:** a short summary and a next step for each band, and a safety rule for
   any item that can mean a person is not safe (PHQ-9's item 9). A safety rule has:
   - a message, shown at once;
   - its own next step, which replaces the band's whenever it triggers;
   - help lines for each country our readers are in, and an `ANY` fallback.

   Plain words, screening language, no dashes, and a school reading grade of 8 or less.
   Jarvis's `check_copy` runs the same rules.

5. **Run the gate:** `npx vitest run features/assessments`. It fails the build when:
   - a reachable total falls in no band, or in two;
   - a band can never be reached;
   - a reversed item's answers are uneven;
   - a safety rule points at no item, can never trigger, triggers on every answer, or has no
     fallback help;
   - the source, license, credit line or published form is missing;
   - our copy (bands and safety messages) breaks the Copy Gate or reads as a diagnosis;
   - `validated` is set without the standard sign-off lines, each signed and dated, against
     the current source.

   The test also pins each instrument's fingerprint (`sourceHash`), so any change to the
   wording fails the build until the test is updated on purpose.

6. **Send the validation pack:** `npx tsx scripts/assessments/validation-pack.ts <id>`
   prints the review document. It shows:
   - the published form and any adaptation;
   - the source's wording beside ours;
   - the scoring and bands, and whose bands they are;
   - the safety routing, with the help lines by country;
   - the gate's result;
   - the lines to sign, and the fingerprint they sign against.
7. **Record the sign-off.** Fill each `signOff` line's `by` and `on` (YYYY-MM-DD). Set
   `signedHash` to the pack's fingerprint, and `status: "validated"`. A later change to the
   wording, answers, scoring or bands changes the fingerprint, and the gate then refuses
   `validated` until it is signed again. A change to our copy alone does not.
8. **Then build on it.** Taking an instrument in the product, storing results and the
   Humangraph come after the first validation, once Mark and Sanjin choose what ships first.

## What is in it now

| Instrument | Measures   | Status        | Why                                                          |
| ---------- | ---------- | ------------- | ------------------------------------------------------------ |
| GAD-7      | anxiety    | in validation | public domain; our copy needs review                         |
| PHQ-9      | depression | in validation | public domain; item 9 routes to crisis help at once          |
| UCLA-3     | loneliness | draft         | the source gives no cutoffs, and commercial use is unchecked |

## Beyond LoveIQ

Each instrument has a place in the Humangraph (affect, anxiety, attachment, desire, meaning,
regulation). Once results are stored, Jarvis's `user_totals` reports them as one more
measure: totals by group, never a person, with the same smallest-group rule.
