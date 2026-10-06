/**
 * Land a probe directly on a survey question.
 *
 * WHY. Reaching question 35 by answering 35 questions takes about 150 seconds
 * per device and breaks whenever a question changes. Both halves of the trick
 * already existed in the probe corpus, in two different files, and nobody had
 * put them together:
 *
 *   - `verify-consent-return.mjs` sets the sessionStorage STEP, which is what
 *     gets you past the intro slides and the consent gate.
 *   - `verify-input-zoom.mjs` sets the localStorage ANSWERS blob, which carries
 *     `currentIndex`.
 *
 * With only the second, `loadInitialStep()` (features/survey/ui/SurveyPage.tsx)
 * returns 0 and the engine never mounts, so the probe sits on the intro. That
 * is why `verify-input-zoom` spent sixty lines clicking "skip intro" and ARIA
 * consent boxes, and it is the real reason it could never measure — not, as
 * scripts/lib/replay-pr.mjs claimed until now, that "the engine derives its
 * position from the answers". It does not: `useSurveyState.loadState()` reads
 * `parsed.currentIndex || 0` with no clamp, and `SurveyEngine` renders a plain
 * `orderedQuestions[currentIndex]`.
 *
 * Verified against production across indices 0, 5, 20 and 37: each lands on a
 * different, correct question.
 */

/** The step that mounts the question engine: past the 4 intro slides + consent. */
export const ENGINE_STEP = "6";

/**
 * Seed storage so the next navigation opens at `index`. Call BEFORE `page.goto`
 * — it installs an init script, so it applies to the document before any of the
 * app's own code runs.
 *
 * `prefilled` stays empty on purpose: a prefilled question is dropped from
 * `orderedQuestions`, which shifts every index after it and would silently move
 * the question you asked for.
 */
export async function seedQuestion(page, index) {
  await page.addInitScript(
    ({ idx, step }) => {
      try {
        sessionStorage.setItem("loveiq-survey-step", step);
        localStorage.setItem(
          "loveiq-survey-answers",
          JSON.stringify({
            answers: {},
            currentIndex: idx,
            startedAt: new Date().toISOString(),
            prefilled: [],
          })
        );
      } catch {
        /* private mode / blocked storage — the probe will report it cannot measure */
      }
    },
    { idx: index, step: ENGINE_STEP }
  );
}
