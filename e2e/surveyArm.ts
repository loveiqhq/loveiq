import type { Page } from "@playwright/test";

import { SURVEY_SESSION_KEY } from "../features/survey/ui/hooks/surveySession";
import {
  assignQuestionOrderArm,
  type QuestionOrderArm,
} from "../shared/experiments/questionOrderArm";

/**
 * Pin a survey session id so the C13 arm — and therefore the question order — is chosen
 * by the test rather than by a coin flip.
 *
 * WHY THIS IS NEEDED AT ALL. C13 derives the arm from the survey session id, which the
 * engine mints fresh on every run. A spec that walks the survey by index would then get
 * the variant opening in roughly half of its runs and fail on question three, with a
 * failure that does not reproduce.
 *
 * WHY NOT `?order=control`. That preview override exists, but it is gated behind
 * `isNonProdDeploy()`, which is FALSE here: `playwright.config.ts` serves
 * `npm run build && npm run start`, so NODE_ENV is "production" and NEXT_PUBLIC_SITE_URL
 * is localhost — neither "staging." nor ".vercel.app". The override is dead in E2E by
 * design, and widening the gate to suit a test would weaken a control whose whole job is
 * to never come on in front of customers.
 *
 * Seeding the id instead uses the app's own mechanism unchanged, and has a second
 * benefit: `orderedOptions` is seeded from the same id, so the randomised option orders
 * become reproducible too.
 */
const SESSION_FIXTURES: Record<QuestionOrderArm, string> = {
  control: "00000000-0000-4000-8000-000000000002",
  variant: "00000000-0000-4000-8000-000000000001",
};

/**
 * The fixtures are only useful if they still bucket the way their names claim. Checked at
 * import so a change to the hash or the salt fails every survey spec with this message,
 * rather than silently running both "arms" against the same order — the failure mode
 * where a test keeps passing while measuring nothing.
 */
for (const [arm, sessionId] of Object.entries(SESSION_FIXTURES) as Array<
  [QuestionOrderArm, string]
>) {
  const actual = assignQuestionOrderArm(sessionId);
  if (actual !== arm) {
    throw new Error(
      `e2e/surveyArm.ts: session fixture for "${arm}" now buckets as "${actual}". ` +
        "Pick a new uuid for it — the survey specs are asserting the wrong order until you do."
    );
  }
}

/**
 * Seed the session id before any page script runs, so the engine reads it on first render
 * instead of minting one. Returns the id, which specs need to recompute the expected
 * option order.
 */
export async function pinSurveySession(page: Page, arm: QuestionOrderArm): Promise<string> {
  const sessionId = SESSION_FIXTURES[arm];
  await page.addInitScript(
    ([key, id]) => {
      try {
        window.sessionStorage.setItem(key, id);
      } catch {
        /* storage blocked — the spec's own session-id assertion will report it */
      }
    },
    [SURVEY_SESSION_KEY, sessionId] as const
  );
  return sessionId;
}
