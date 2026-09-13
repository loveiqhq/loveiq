# Removed survey questions

> Owner: CODEOWNERS default
> Last verified: 2026-09-11
> Verified against: `data/survey-data.ts`, `data/survey-source.csv`, `data/scoring-config.ts`

Questions that were **removed from the live survey**, kept here so they can be restored
without archaeology. Git history holds them too, but nobody thinks to `git log` a survey
question two quarters after it disappeared.

**Every historical answer is still in the database and still queryable.** Removing a
question stops it being _asked_; it does not delete what people already answered. The
`survey_question` and `answer_option` rows stay, so old submissions keep resolving. The
question rows are marked `status = 'retired'` rather than deleted: nothing references
`status` when reading an answer, so every historical answer stays joinable.

## How to restore one

1. Paste the question's CSV row back into `data/survey-source.csv` (row order does not
   matter — `scripts/update-survey.js` sorts by `QID`).
2. Run `node scripts/update-survey.js` to regenerate `data/survey-data.ts`.
3. Paste the overlay spec back into the `overlays` array in `data/scoring-config.ts`.
4. Run `npx vitest run features/scoring/tests/label-coverage.test.ts`, which cross-checks
   the survey data against the scoring config and fails if only one side was restored.
5. Flip the database row back to active — the questions were marked `status = 'retired'`
   by `20260911200200_retire_survey_questions_03014_16008.sql`:

   ```sql
   UPDATE survey_question SET status = 'active', updated_date_time = now()
   WHERE frontend_qid = '<qid>';
   ```

   Skipping this does **not** break submission (`submit_survey` looks a question up by
   `frontend_qid`, not by status), so the restored question would collect answers
   normally — but it would show up as config drift on /admin/health and would be missed
   by `scripts/check-survey-db-sync.js`, which only reads active rows.

Do not hand-edit `data/survey-data.ts` — it is generated, and the next regeneration would
silently drop the change.

**Line endings matter here, and the failure is confusing.** Several of these fields
contain newlines _inside_ a quoted value, so a row is many physical lines. `csv-parse`
needs one consistent record delimiter across the whole file: paste a row with LF endings
into a CRLF working copy (the normal state on Windows, given `* text=auto`) and the
generator dies with `Invalid Closing Quote: found non trimable byte after quote` pointing
at a line number nowhere near the row you added. Pasting in an editor gets this right on
its own, because the editor matches the file. Appending with a script does not — match the
file's existing endings if you do.

This restore path was tested on 2026-09-11: both questions below were put back and
regenerated, and all 59 questions came out identical to the pre-deletion original.

## 03014 — During sex, I can usually reach orgasm when I want to.

|                 |                                            |
| --------------- | ------------------------------------------ |
| Removed         | 2026-09-11                                 |
| Work order item | C1                                         |
| Chapter         | Arousal Styles — Cues, Conditions & Brakes |
| Overlay removed | `OVL_ORGASM_EASE`                          |

**Why it was removed.** No runtime consumer and no analysis waiting on it. The overlay it fed, `OVL_ORGASM_EASE`, was computed on every submission into the engine's diagnostics bag and read by nothing — it is not a scored dimension and no weight rule references it, so removing it cannot change anyone's archetype. Answers spread evenly across the scale, so at n over 1,250 another year of collection moves no estimate we would act on. If research wants this measure later it belongs in a consented instrument.

### Question definition

```ts
{
    qId: "03014",
    cId: 3,
    chapter: "Arousal Styles — Cues, Conditions & Brakes",
    question: "During sex, I can usually reach orgasm when I want to.",
    answerType: "scale",
    options: [],
    required: true,
    guide:
      "Think about typical partnered sex in recent months, in decent conditions. This is about pattern, not pressure.",
    supportAndGuidance:
      "Think about typical partnered sex in recent months, in decent conditions. This is about pattern, not pressure.",
    scaleLabels: { low: "Not true at all", high: "Completely true" },
    comment:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    howAnswerIsUsed:
      "Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.",
    hoverStates: {
      "1": "Not true at all: Orgasm with a partner is very uncommon for you, even when you want it and conditions are reasonably supportive.",
      "2": "Mostly not true: Orgasm with a partner is possible, but only in rare or unusually favorable situations.",
      "3": "Slightly not true: Orgasm with a partner happens from time to time, but it is not something you can generally count on.",
      "4": "Mixed / depends: Orgasm with a partner happens with some consistency, though it still feels variable and not fully dependable.",
      "5": "Slightly true: Orgasm with a partner is available to you fairly often and feels like a recurring part of partnered sex.",
      "6": "Mostly true: Orgasm with a partner happens in most supportive situations when you want it.",
      "7": "Completely true: Orgasm with a partner is highly accessible and reliably available to you when you want it.",
    },
  }
```

### Source CSV row

```csv
QID,CID,Category & chapter,Question,Answer format,Answer format guidance,Info and guidance,Answer options,1-7 Explanations,How this answer will be used
03014,3,"Arousal Styles — Cues, Conditions & Brakes","During sex, I can usually reach orgasm when I want to.",1-7 scale,,"Think about typical partnered sex in recent months, in decent conditions. This is about pattern, not pressure.","1 = Not true at all
2 = Mostly not true
3 = Slightly not true
4 = Mixed / depends
5 = Slightly true
6 = Mostly true
7 = Completely true","1 = Not true at all: Orgasm with a partner is very uncommon for you, even when you want it and conditions are reasonably supportive.
2 = Mostly not true: Orgasm with a partner is possible, but only in rare or unusually favorable situations.
3 = Slightly not true: Orgasm with a partner happens from time to time, but it is not something you can generally count on.
4 = Mixed / depends: Orgasm with a partner happens with some consistency, though it still feels variable and not fully dependable.
5 = Slightly true: Orgasm with a partner is available to you fairly often and feels like a recurring part of partnered sex.
6 = Mostly true: Orgasm with a partner happens in most supportive situations when you want it.
7 = Completely true: Orgasm with a partner is highly accessible and reliably available to you when you want it.","Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype."
```

### Scoring overlay

```ts
{
    id: "OVL_ORGASM_EASE",
    name: "Orgasms easy with a partner (overlay)",
    qid: "03014",
    transform: "scale_1_7_to_0_1",
  }
```

## 16008 — What kind of support would actually help you most with your top focus?

|                 |                          |
| --------------- | ------------------------ |
| Removed         | 2026-09-11               |
| Work order item | C3                       |
| Chapter         | Next Steps & Preferences |
| Overlay removed | `OVL_SUPPORT_PREFS`      |

**Why it was removed.** 40.4% answer "Not sure yet" and 36.5% answer nothing else at all, because abstaining costs nothing. It measures decision-avoidance rather than preference. Its job moves to a priced question, which asks the same thing with money attached; that 40.4% abstention rate is the baseline the replacement has to beat. Like the above it fed a diagnostics-only overlay (`OVL_SUPPORT_PREFS`), not a scored dimension.

### Question definition

```ts
{
    qId: "16008",
    cId: 16,
    chapter: "Next Steps & Preferences",
    question: "What kind of support would actually help you most with your top focus?",
    answerType: "multiple",
    options: [
      "Self-guided tools I can use on my own (prompts, exercises, reflections)",
      "A short, structured program over a few weeks",
      "A live group, workshop, or circle",
      "Support I can do together with the person I'm with",
      "1-on-1 work with a professional",
      "Not sure yet",
    ],
    required: true,
    guide:
      "Pick what would actually make your next step easier in real life — not what sounds most impressive.",
    supportAndGuidance:
      "Pick what would actually make your next step easier in real life — not what sounds most impressive.",
    comment:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    howAnswerIsUsed:
      "This shapes the format of your recommendations—more practical, reflective, structured, or supportive.",
    formatGuidance: "Select all that apply.",
  }
```

### Source CSV row

```csv
QID,CID,Category & chapter,Question,Answer format,Answer format guidance,Info and guidance,Answer options,1-7 Explanations,How this answer will be used
16008,16,Next Steps & Preferences,What kind of support would actually help you most with your top focus?,Multiple choice,Select all that apply.,Pick what would actually make your next step easier in real life — not what sounds most impressive.,"- Self-guided tools I can use on my own (prompts, exercises, reflections)
- A short, structured program over a few weeks
- A live group, workshop, or circle
- Support I can do together with the person I'm with
- 1-on-1 work with a professional
- Not sure yet",N/A,"This shapes the format of your recommendations—more practical, reflective, structured, or supportive."
```

### Scoring overlay

```ts
{
    id: "OVL_SUPPORT_PREFS",
    name: "Support preferences",
    qid: "16008",
    transform: "multiselect_to_support_tags",
  }
```
