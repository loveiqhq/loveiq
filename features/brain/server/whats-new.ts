import { supabaseFetch } from "@features/admin/server/supabase";
import { MAX_QUEUED, researchInState } from "@features/brain/server/night-shift";

/**
 * WHAT THE BRAIN PRODUCED ON ITS OWN, since a time: the door for "what's new", and what the
 * Claude Code session hook shows when a session starts. Plan item C8: proactive output
 * lands in Claude, not in a Slack channel.
 *
 * "New" means first written for a notice or a decision (both are re-written in place, so
 * `updated_at` would call a week-old notice new every morning), and answered for research
 * (a research record is created when the question is queued, and answered later).
 */

export interface NewItem {
  source: string;
  id: string;
  title: string;
  at: string;
  /** The day a decision was made, when that is not the day it was first recorded. */
  decided?: string;
}

export async function whatsNew(
  sinceIso: string
): Promise<{ ok: true; items: NewItem[]; waiting: number | null } | { ok: false; status: number }> {
  const since = encodeURIComponent(sinceIso);
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source,source_id,title,meta,first_seen_at,updated_at,period_end` +
      `&source_id=not.like.*%23*` +
      `&or=(and(source.in.(notice,decision),first_seen_at.gte.${since}),` +
      `and(source.eq.research,updated_at.gte.${since},meta->>status.in.(done,failed)))` +
      `&order=updated_at.desc&limit=40`
  );
  if (!res.ok) return { ok: false, status: res.status };
  const rows = (await res.json()) as Array<{
    source: string;
    source_id: string;
    title: string | null;
    first_seen_at: string | null;
    updated_at: string;
    period_end: string | null;
  }>;
  const items = rows
    .map((r) => ({
      source: r.source,
      id: `${r.source}/${r.source_id}`,
      title: r.title ?? "(untitled)",
      at: (r.source === "research" ? r.updated_at : (r.first_seen_at ?? r.updated_at)).slice(0, 16),
      // The miner reconstructs decisions from months-old meetings; the day it recorded one is
      // not the day it was made, and a line reading "decided" on the wrong day misleads.
      ...(r.source === "decision" && r.period_end ? { decided: r.period_end } : {}),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  // Still waiting for the Night Shift: an addition, so an unreadable queue only drops the line.
  const waiting = await researchInState(["queued", "running"], MAX_QUEUED)
    .then((q) => q.length)
    .catch(() => null);
  return { ok: true, items, waiting };
}

const LABEL: Record<string, string> = {
  notice: "noticed",
  research: "Night Shift",
  decision: "decision recorded",
};

export function renderWhatsNew(
  items: NewItem[],
  waiting: number | null,
  sinceLabel: string,
  max = 20
): string {
  const lines = items
    .slice(0, max)
    .map(
      (i) =>
        `- ${i.at.replace("T", " ")} ${LABEL[i.source] ?? i.source}: ${i.title}` +
        `${i.decided && i.decided !== i.at.slice(0, 10) ? ` (decided ${i.decided})` : ""} (${i.id})`
    );
  const more =
    items.length > max ? `\n(${items.length - max} more; narrow \`since\` to see them.)` : "";
  const queue =
    waiting === null
      ? ""
      : waiting > 0
        ? `\n\nWaiting for tonight's Night Shift: ${waiting} question${waiting === 1 ? "" : "s"}.`
        : "";
  if (lines.length === 0) {
    return `Nothing new since ${sinceLabel}: no notices, research answers or decisions.${queue}`;
  }
  return (
    `New since ${sinceLabel}, newest first:\n${lines.join("\n")}${more}${queue}\n\n` +
    "Read any of these in full with fetch_document."
  );
}
