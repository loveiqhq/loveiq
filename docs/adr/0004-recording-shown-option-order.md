# ADR 0004 — Recording the order answer options were shown in

- Status: Proposed
- Date: 2026-09-11
- Deciders: pending review (Eman)
- Related: `features/survey/questionFlags.ts`, `features/survey/ui/questionOrder.ts`,
  `features/survey/server/server.ts`,
  `supabase/migrations/20260911102618_survey_submission_option_order.sql`

## Context

Several survey questions ask for a ranking in disguise: which changes would matter most,
what is already part of your life, what is getting in the way. Their options were rendered
in one fixed order, the same for every respondent, and that order was never recorded.

The consequence is not a small bias, it is an unanswerable question. The share an option
received cannot be separated from the advantage of sitting near the top, and because the
order was uniform there is no contrast in the data to estimate the effect from. Roughly
1,250 existing responses are therefore unusable as a ranking, permanently — this cannot be
corrected after the fact by any analysis.

Randomising the order alone does not fix it either. It removes the systematic advantage
but, without knowing what each respondent saw, it replaces one unusable dataset with
another: you can no longer say a top-listed option was favoured, but you also cannot say
anything about position at all.

So the order has to be both randomised **and** stored. Storing it is the half that gets
forgotten, and it is the half that makes the data usable.

## Decision

### 1. Store the shown order per submission, on `survey_submission`

One nullable `jsonb` column, `option_order`, shaped `{"<qId>": ["<option text>", …]}`,
written by the **existing best-effort consent PATCH** in `submitSurveyOnce`.

Rejected: threading it through the `submit_survey` RPC. That would change the function
signature, the migration defining it, and every caller, to carry one nullable value the
answer fan-out has no use for. This repository already made exactly this call for
`posthog_session_id` (migration `20260827190907`), and the reasoning is recorded in
`features/survey/server/server.ts`. Following the existing precedent beats inventing a
second pattern.

Rejected: a column on `survey_submission_answer`. One session shows one order per
question, so per-answer storage duplicates the same array on every row of a multi-select.

Consequence: the write is best-effort. A failed PATCH loses the order for that submission
while the submission itself still succeeds. That is the right trade — a lost primacy
correction is recoverable by ignoring the row; a lost submission is not.

### 2. Options are shuffled from a seed, never `Math.random()`

The seed is `(session id, qId)`, so the order is stable across re-render, back-navigation
and reload, and is reproducible server-side at submit time without threading render state
back up through the engine.

Mixing the qId into the seed matters: seeded on the session alone, every question with the
same number of options would share one permutation, reintroducing a correlated position
effect across questions — a subtler version of the bias being removed.

### 3. Shuffled if and only if recorded

When storage is blocked (Safari private mode, some in-app WebViews) `getSessionId()`
returns empty, and no order can be recorded. In that case options are **not** shuffled
either. A shuffled-but-unrecorded answer is worse than an unshuffled one, because it looks
comparable to authored-order answers and is not.

### 4. Which questions randomise lives in code, not the survey CSV

`features/survey/questionFlags.ts` holds the qId set.

`data/survey-source.csv` is exported from an upstream "Assessment Questions" xlsx, and its
V3 revision deliberately _removed_ columns in favour of deriving values from copy the
respondent already reads. A new column there would sit outside the maintained source, so a
future export could drop it silently — randomisation would switch off with no error, no
failing test, and no signal until someone noticed months of rankings were unusable again.
Randomisation is also display behaviour rather than survey content.

## Consequences

- Rankings from rows where `option_order` is null are **not** comparable to rows where it
  is set. Any analysis joining across the boundary has to say which side it is on.
- Existing rows are deliberately not backfilled. The order shown to past respondents is
  genuinely unknown, and writing a uniform order would assert something false about data
  whose entire problem is that the order was uniform.
- Answer resolution is unaffected: `submit_survey` matches picks by exact `option_text`,
  never by index, so shuffling cannot mis-resolve an answer.
- A question whose options carry a meaningful reading order — a price ladder, or any list
  with an opt-out that must stay last — must stay out of `RANDOMISE_QIDS`. `16009` is the
  first such case.
