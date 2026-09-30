# features/assessments

**Purpose:** the Assessment Factory. Validated psychometric instruments (GAD-7, PHQ-9,
UCLA-3 so far) held exactly as their sources publish them, scored by one generic engine,
checked by an automated gate, and signed off by people (Mark and Sanjin by default, or
whoever the team decides approves instead, by their own name) before anyone takes them. The first building block of the Applied Psychometrics platform's instrument
library ("Proven instruments, applied faithfully").

**Entry:**

- `instruments/` — one file per instrument, and `index.ts`, the registry.
- `logic/types.ts` — what an instrument is: the source's part (items, answers, scoring,
  band labels) and ours (band copy, next steps, safety routing), kept apart.
- `logic/score.ts` — `scoreInstrument`: reversed items, sum or mean, the band, and every
  safety rule the answers trigger.
- `logic/check.ts` — `checkInstrument`: the automated gate (bands cover every reachable
  total, safety rules can trigger, a source and license exist, our copy passes the Copy
  Gate and never diagnoses, `validated` only when every sign-off line is signed).
- `logic/signoff.ts` — the lines people sign for every instrument.
- `tests/` — every instrument through the gate, every band edge, the safety trigger, and the
  gate against broken definitions.
- `scripts/assessments/validation-pack.ts` — the review document for the people who sign.

**Belongs:** instrument definitions, scoring, the gate, the review pack.

**Does NOT belong (yet):** a UI to take an instrument, storing results, or the Humangraph.
Those come once an instrument is validated and the product decision (Mark and Sanjin) says
which one ships first. LoveIQ's own archetype survey stays in `features/scoring/`.

**Rules:**

- Never paraphrase the source's part, and copy it from one pinned published form (`form`).
  A wording change is a validation question, not an edit: it changes `reviewHash`, fails
  the pinned-fingerprint test, and voids a sign-off. So does a change to our copy, a safety
  message or a help line: a changed crisis message must be read again before it ships.
- Screening, never diagnosis, in every line of our copy, the safety messages included.
- A safety rule is never behind a paywall and never waits for the score. Its next step
  replaces the band's, and its help lines are by country with an `ANY` fallback.
- An instrument with an unchecked license stays `draft`; the gate refuses anything else.
