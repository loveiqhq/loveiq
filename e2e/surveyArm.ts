import type { Page } from "@playwright/test";

import { SURVEY_SESSION_KEY } from "../features/survey/ui/hooks/surveySession";
import {
  assignQuestionOrderArm,
  type QuestionOrderArm,
} from "../shared/experiments/questionOrderArm";
import { assignGateRevealArm, type GateRevealArm } from "../shared/experiments/gateRevealArm";

/**
 * Pin a survey session id, so what it decides is chosen by the test rather than by a coin
 * flip: the option shuffle and the half of the EUR 1.99 page's 50/50 below.
 *
 * THE QUESTION ORDER IS NO LONGER ONE OF THEM. While C13 ran it derived the arm from the
 * session id, and a spec walking the survey by index got the variant opening in about half
 * of its runs. The test ended on 21 Nov 2026 (QUESTION_ORDER_TEST_END) and the variant won:
 * every fresh run is asked it, whatever arm its id drew, so `order` here only picks which
 * fixture is used. A spec that needs the old order seeds a draft that records it
 * (`orderArm: "control"`, as survey-sheets.spec.ts does), or one with progress and no arm,
 * which reopens in the old order like a draft from before C13.
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
 *
 * THE EMAIL QUESTION TEST drew its arm from the same id until it ended on 4 Nov 2026
 * (`emailQuestionArm.ts`). Every run is asked the anonymous version now, whatever its id,
 * so the fixtures pin only the order. (Both drew the email test's control arm, which is
 * what the walks that reach the email question once asserted.)
 */
/**
 * The same id also decides the half of Mark's 50/50 of the new EUR 1.99 page (gateRevealArm.ts),
 * which decides how the survey's halfway sheet and report map tell the offer (16 Nov). The first
 * fixture of an order is the one a spec that names no half gets; both are in the new page's half.
 */
const SESSION_FIXTURES: ReadonlyArray<{
  order: QuestionOrderArm;
  gate: GateRevealArm;
  sessionId: string;
}> = [
  { order: "control", gate: "reveal", sessionId: "00000000-0000-4000-8000-000000000007" },
  { order: "variant", gate: "reveal", sessionId: "00000000-0000-4000-8000-000000000001" },
  { order: "control", gate: "control", sessionId: "00000000-0000-4000-8000-000000000011" },
  { order: "variant", gate: "control", sessionId: "00000000-0000-4000-8000-000000000004" },
];

/**
 * The fixtures are only useful if they still bucket the way their names claim. Checked at
 * import so a change to the hash or the salt fails every survey spec with this message,
 * rather than silently running both "arms" against the same order — the failure mode
 * where a test keeps passing while measuring nothing.
 */
for (const { order, gate, sessionId } of SESSION_FIXTURES) {
  const actual = assignQuestionOrderArm(sessionId);
  const actualGate = assignGateRevealArm(sessionId);
  if (actual !== order || actualGate !== gate) {
    throw new Error(
      `e2e/surveyArm.ts: the session fixture for order "${order}" and gate "${gate}" now ` +
        `buckets as "${actual}" and "${actualGate}". Pick a new uuid for it — the survey ` +
        "specs are asserting the wrong screens until you do."
    );
  }
}

/**
 * Seed the session id before any page script runs, so the engine reads it on first render
 * instead of minting one. Returns the id, which specs need to recompute the expected
 * option order.
 */
export async function pinSurveySession(
  page: Page,
  arm: QuestionOrderArm,
  gate?: GateRevealArm
): Promise<string> {
  const fixture = SESSION_FIXTURES.find((f) => f.order === arm && (!gate || f.gate === gate));
  if (!fixture) {
    throw new Error(
      `e2e/surveyArm.ts: no session fixture for order "${arm}"${gate ? ` and gate "${gate}"` : ""}. Add one.`
    );
  }
  const { sessionId } = fixture;
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
