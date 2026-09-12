import { healthChunkBody, planHealth } from "@features/brain/server/plan";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * What is open on the board, and what has not moved.
 *
 * The Notion board is the team's system of record by recorded decision, and every task
 * already carries `state`, `assignee`, `due` and `edited` in `brain_chunk`. Nothing read
 * them together, so "what is slipping" was a question the corpus held the answer to and
 * could not be asked: a task could sit untouched for eleven weeks and the only way to
 * notice was for a person to scroll past it.
 *
 * ONE CHUNK, REBUILT EACH RUN — the `ingestPeople` shape, for the same reason it was
 * chosen there: the questions are "what is slipping" and "what is everyone on", and each
 * needs the whole board in view rather than one task at a time. Individual tasks are
 * already indexed separately and searchable on their own words.
 *
 * WRITTEN EVEN WHEN NOTHING IS SLIPPING. A chunk that vanishes on a healthy week makes
 * "is anything slipping" unanswerable exactly when the answer is "no" — and an absent
 * record reads as an unasked question rather than as a clean bill of health.
 */
const SOURCE = "plan";

export async function ingestPlan(stampedAt: string): Promise<IngestResult> {
  const health = await planHealth();
  // A board that could not be READ must not sweep the last good answer away and leave
  // the corpus silent — silence here reads as "nothing is slipping".
  if (health.unavailable) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: `board-unreadable` };
  }

  const row: BrainRow = {
    source: SOURCE,
    source_id: "plan:board-health",
    // Titled the way the question is asked, because titles are weighted double.
    title: "What is open on the board, what is overdue, and what has not moved",
    url: null,
    body: healthChunkBody(health),
    meta: {
      kind: "board-health",
      open: health.openCount,
      stale: health.stale.length,
      overdue: health.overdue.length,
      // The person spine joins this to everything else they are named in.
      people: [
        ...new Set(
          [...health.stale, ...health.overdue]
            .map((i) => i.assignee)
            .filter((a): a is string => Boolean(a))
            .flatMap((a) => a.split(/,\s*/))
        ),
      ],
    },
    updated_at: stampedAt,
    // Describes now, not a past period — same as the roster.
    period_end: null,
  };

  const written = await upsertChunks([row]);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
