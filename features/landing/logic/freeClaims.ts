import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";

/**
 * What the site says is free, in one place: the home page's machine-readable data (price and
 * quiz), its FAQ and llms.txt all read this line (GEO/SEO phase 1, card 2, promised at the 29 Oct
 * sync).
 *
 * Marcus, 13 Nov: "The survey is free and your initial result. Deeper reports start at €1.99",
 * as the guiding line, adapted to context, and "we shouldn't make claims we can't deliver on".
 * Today nothing personal opens before EUR 1.99, and Mark's new EUR 1.99 page, which shows the
 * archetype, runs as a 50/50 (shared/experiments/gateRevealArm.ts), so "and your initial
 * result" holds for half the finishers at most; Mark wants the test read before a free
 * archetype is claimed (his answer 9). The line stops at what is true for everyone; once his
 * page wins, it gains the initial result here and nowhere else.
 */

/** The same price as schema.org writes it: "1.99". */
export const ENTRY_PRICE_SCHEMA = (INITIAL_UNLOCK_PRICE_CENTS / 100).toFixed(2);

/**
 * The entry price, from the EUR 1.99 gate's own constant: "€1.99". Written out here rather than
 * through the gate's `euros()`: the home page's FAQ renders in the browser, and the gate's copy
 * file has no business in the landing page's bundle.
 */
export const ENTRY_PRICE = `€${ENTRY_PRICE_SCHEMA}`;

export const SURVEY_FREE_LINE = `The survey is free. Deeper reports start at ${ENTRY_PRICE}.`;
