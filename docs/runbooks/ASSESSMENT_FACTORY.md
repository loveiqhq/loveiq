# Assessment Factory

How a new psychometric instrument goes from a paper to something a person can safely take.
The code is in `features/assessments/`. Mark and Sanjin validate by default, and the team can
decide someone else approves instead (step 7); which instrument ships first is their decision.

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
   Jarvis's `check_copy` runs the dash, phrasing and absolute-claim part of these rules. The
   diagnosis wording and the grade-8 limit at any length are the gate's own.

5. **Run the gate:** `npx vitest run features/assessments`. It fails the build when:
   - a reachable total falls in no band, or in two;
   - a band can never be reached;
   - a reversed item's answers are uneven;
   - a safety rule points at no item, can never trigger, triggers on every answer, or has no
     fallback help;
   - a help line is empty, or is filed under a region that is not `ANY` or a two-letter
     country code in capitals, or under the same region twice (the reader's country is
     matched in capitals, so `gb` would never be found);
   - the instructions, the source, the license terms, the credit line or the published form
     is missing or empty;
   - our copy (bands and safety messages) breaks the Copy Gate or reads as a diagnosis;
   - `validated` is set without the standard sign-off lines, each signed and dated, against
     what is there now.

   The test also pins every instrument's fingerprint (`reviewHash`), and fails when an
   instrument has no pin, so any change to what the sign-off covers fails the build until
   the test is updated on purpose. The fingerprint covers the wording of the sign-off lines
   too: rewording a line in `signoff.ts` voids every signature under it.

6. **Send the validation pack:** `npx tsx scripts/assessments/validation-pack.ts <id>`
   prints the review document. It shows:
   - the published form and any adaptation;
   - the source's wording beside ours;
   - the scoring and bands, and whose bands they are;
   - the safety routing, with the help lines by country;
   - the gate's result;
   - the lines to sign, and the fingerprint they sign against.
7. **Record the sign-off.** Fill each `signOff` line's `by` and `on` (YYYY-MM-DD) with the
   person who actually signed it: Mark and Sanjin by default, or whoever the team decides
   approves instead, never a name that did not sign (GAD-7 and PHQ-9: Eman, 2026-09-30). Set
   `signedHash` to the pack's fingerprint, and `status: "validated"`. A later change to
   anything the lines cover changes the fingerprint, and the gate then refuses `validated`
   until it is signed again: the wording, answers, scoring and bands, and also our copy, the
   safety routing and its help lines, the license and the sources. Only the bookkeeping
   (`status`, `version`, the sign-off lines themselves) is left out.
8. **Then build on it.** Taking an instrument in the product, storing results and the
   Humangraph come after the first validation, once Mark and Sanjin choose what ships first.

## What is in it now

| Instrument | Measures                    | Status        | Why                                                                                       |
| ---------- | --------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| GAD-7      | anxiety                     | validated     | approved by Eman on 2026-09-30; free with the credit line                                 |
| PHQ-9      | depression                  | validated     | approved by Eman on 2026-09-30; item 9 routes to crisis help                              |
| UCLA-3     | loneliness                  | draft         | the source gives no cutoffs, and commercial use is unchecked                              |
| SCS-SF     | self-compassion             | in-validation | Inner Critic backbone; Neff grants use "for any purpose whatsoever"; bands are her rubric |
| RSES       | self-esteem                 | draft         | Inner Critic backbone; permission covers research only; bands are ours (15 and 25)        |
| BFNE       | fear of negative evaluation | draft         | Boundaries backbone; a catalogue says "no restrictions", the rights holder was not asked  |
| UCS        | unmitigated communion       | draft         | Boundaries backbone; no terms of use, and the scoring key is inferred until checked       |

## What it works on next

1. **GAD-7 and PHQ-9 are validated.** Eman approved them on 2026-09-30 without waiting for
   Mark and Sanjin's line-by-line review, and the sign-off lines name him. Mark and Sanjin
   can still review them in the validation pack; a change they ask for is a new sign-off.
2. **Four licenses to ask about.** UCLA-3 (Daniel Russell), RSES (the Rosenberg family,
   through the University of Maryland), BFNE (Mark Leary, and Sage) and UCS (Vicki
   Helgeson). The question for each is the same: may a paid product show the scale to people
   who take it on their own, with the credit line? Until then each stays a draft, and its
   lines wait, because settling the license changes its fingerprint. UCS also needs its
   scoring key checked against Fritz and Helgeson (1998): item 2 reversed and a mean are
   inferred from the wording, not read from the source.
3. **SCS-SF is ready for its validators.** It is the first instrument whose license allows
   commercial use outright and that has reversed items, so its sign-off also checks the
   engine's reversing against Neff's key.
4. **Which assessments come next** is Mark's roadmap of 10 to 20 assessments. His portfolio
   matrix of 18 Sep ranks "The Inner Critic" first and "Boundaries & People-Pleasing"
   second; the four above are their backbones that fit the factory as it is. The others
   named there (FSCRS, GASP, the Silencing the Self Scale) report several subscales, which
   the engine does not score yet. What people
   most want to understand next will come from the survey's demand question once it ships,
   and Jarvis's `user_totals` (`measure: "answers"`) counts the answers.
5. **After the first validation:** step 8.

Jarvis holds the status and the owners as a recorded decision (topic `assessments`).

## Beyond LoveIQ

Each instrument has a place in the Humangraph (affect, anxiety, attachment, desire, meaning,
regulation, self). Once results are stored, Jarvis's `user_totals` reports them as one more
measure: totals by group, never a person, with the same smallest-group rule.
