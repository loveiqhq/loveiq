---
name: assessment-factory
description: Add or change a questionnaire in the Assessment Factory (features/assessments) - the license check, the exact published wording, the scoring key, bands, safety routing, tests and the validation pack. Use before touching features/assessments/instruments or its gate.
---

# Assessment Factory

The full procedure is `docs/runbooks/ASSESSMENT_FACTORY.md`. These are the steps and the
mistakes that have already been made once.

## Steps

1. **License, from the rights holder's own words.** Read the author's or publisher's page
   and quote it. Grep the raw HTML too (image alt text, banners, meta): the University of
   Maryland's public-domain notice for the Rosenberg scale is an image, and a text-only read
   filed it as research-only. "Free for research and clinical use" is not commercial
   permission: that instrument stays `draft` with the question written down in
   `license.terms`.
2. **Wording from one pinned form.** Copy items, answers, instructions and punctuation
   word for word from the form in `form.url` (curly apostrophes included). Any change from
   it, even "circle" to "choose", goes in `form.adaptation`.
3. **Citations checked against Crossref** (`https://api.crossref.org/works/<doi>`). One
   first author was wrong until it was checked.
4. **Scoring from the source's key**, reversed items included. If no source states the
   key, say it is inferred, in the file and in `form.adaptation`, and leave it to the
   validators. Never guess silently.
5. **Bands**: the source's when it has them (`bandsFrom: "source"`), otherwise ours, and
   the gate checks that every reachable total falls in exactly one band.
6. **Our copy** (band summaries, next steps, safety messages) passes the gate: plain words,
   school grade 8 or less, no dashes, no absolutes, never a diagnosis.
7. **Register** the file in `instruments/index.ts` (file name = `id`, item ids start with
   `<id>_`) and pin its fingerprint in the test's `PINNED` map.
8. **Test the key** against the source (reversed set, range, band edges on reachable
   totals). When mutation-testing, run with `-t "<your describe>"` so the pinned
   fingerprints cannot hide a weak test, and commit before you mutate.
9. **Status**: `draft` or `in-validation` only. `validated` needs a person to sign every
   line in the validation pack (`npx tsx scripts/assessments/validation-pack.ts <id>`);
   code never signs.
