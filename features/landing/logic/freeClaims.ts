import { INITIAL_UNLOCK_PRICE_CENTS } from "@features/report/logic/initialUnlockGate";

/**
 * What the site says is free, in one place: the home page's machine-readable data (price and
 * quiz), its FAQ and llms.txt all read this line (GEO/SEO phase 1, card 2, promised at the 29 Oct
 * sync).
 *
 * Marcus, 13 Nov: "The survey is free and your initial result. Deeper reports start at €1.99",
 * as the guiding line, adapted to context, and "we shouldn't make claims we can't deliver on".
 * In production nothing personal opens before EUR 1.99 (the gate, on since 27 Oct); a day
 * later the gift email unlocks it free for most readers who did not pay, not for all. So "and
 * your initial result" is not true for everyone, and "Deeper reports" on its own made the
 * EUR 1.99 result itself sound free: the line says reports start at EUR 1.99, the first being
 * that result. Mark's new EUR 1.99 page, which shows the archetype, is on staging for a 50/50,
 * and he wants it read before a free archetype is claimed (his answer 9); if it wins, the line
 * gains the initial result here and nowhere else.
 */

/** The same price as schema.org writes it: "1.99". */
export const ENTRY_PRICE_SCHEMA = (INITIAL_UNLOCK_PRICE_CENTS / 100).toFixed(2);

/**
 * The entry price, from the EUR 1.99 gate's own constant: "€1.99". Written out here rather than
 * through the gate's `euros()`: the home page's FAQ renders in the browser, and the gate's copy
 * file has no business in the landing page's bundle.
 */
export const ENTRY_PRICE = `€${ENTRY_PRICE_SCHEMA}`;

export const SURVEY_FREE_LINE = `The survey is free. Reports start at ${ENTRY_PRICE}.`;
