import { supabaseFetch } from "@features/admin/server/supabase";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * Who works here and what they do.
 *
 * WHY THIS EXISTS. Measured 2026-09-11 across ~22,000 indexed chunks: the corpus
 * states a colleague's role exactly three times, and never the CEO's. "who is the
 * CEO" returned forty chunks and every one was about a DIFFERENT company's chief
 * executive — Supabase's founder in a welcome email, a customer testimonial, an
 * investor newsletter. The first question a new joiner asks had no answer, and the
 * confident wrong ones were worse than nothing.
 *
 * It cannot be fixed by writing a file. Roles attach to named people and this
 * repository is public, so the names live in `brain_person` — private — and this
 * builds the searchable chunk from them. Correcting a role is a one-row update; the
 * chunk follows on the next run.
 *
 * ONE CHUNK, NOT ONE PER PERSON. The questions are "who is the CEO", "who does what",
 * "who works on the product" — each needs the whole roster in view to answer, and a
 * per-person chunk would answer "who is the CEO" with whichever person's chunk
 * happened to score highest, which is exactly the failure being fixed.
 */
const SOURCE = "people";

interface PersonRow {
  canonical: string;
  kind: "person" | "bot" | "shared";
  active: boolean | null;
  role: string | null;
  role_confidence: "confirmed" | "unconfirmed" | null;
}

export async function ingestPeople(stampedAt: string): Promise<IngestResult> {
  const res = await supabaseFetch(
    "/rest/v1/brain_person?select=canonical,kind,active,role,role_confidence&kind=eq.person&order=canonical"
  );
  // A failed read must not sweep the roster away and leave the corpus with nothing.
  if (!res.ok) return { source: SOURCE, rows: 0, swept: 0, skipped: `people-read-${res.status}` };
  const people = (await res.json()) as PersonRow[];
  if (!Array.isArray(people) || people.length === 0) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "people-empty" };
  }

  /**
   * Spell the initials out alongside the title. People ask "who is the CTO", never
   * "who is the Chief Technology Officer" — and measured 2026-09-11, a roster holding
   * only the expanded form ranked 1st for "who is the CEO" (carried by the semantic
   * arm alone) and MISSED "who is the CTO" entirely, because those three letters
   * appeared nowhere in it.
   */
  const acronym = (role: string): string => {
    const initials = role
      .replace(/,.*$/, "")
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w[0])
      .join("");
    return initials.length >= 2 && !role.includes(initials) ? ` (${initials})` : "";
  };

  const line = (p: PersonRow): string => {
    const here = p.active === false ? " — has left the company" : "";
    if (!p.role) return `- ${p.canonical}${here} — role not recorded.`;
    const caveat =
      p.role_confidence === "unconfirmed"
        ? " (reported with a caveat — treat as unconfirmed and say so)"
        : "";
    return `- ${p.canonical}: ${p.role}${acronym(p.role)}${caveat}${here}`;
  };

  const withRole = people.filter((p) => p.role);
  const withoutRole = people.filter((p) => !p.role && p.active !== false);

  const body = [
    "Who works at LoveIQ and what each person does — the team, the roles, who does what,",
    "the org chart, who is in charge, who to ask about what.",
    "",
    "This is the roster, kept deliberately rather than inferred from who appears in",
    "emails. It is the authoritative answer to who holds a role. If a search returns",
    "someone described as a CEO or founder in an email, check here first — most such",
    "mentions are other companies' people writing to us.",
    "",
    ...withRole.map(line),
    ...(withoutRole.length
      ? [
          "",
          "Also on the team, with no role recorded — do not guess one:",
          ...withoutRole.map(line),
        ]
      : []),
    "",
    `Roles last reviewed ${stampedAt.slice(0, 10)}.`,
  ].join("\n");

  const row: BrainRow = {
    source: SOURCE,
    source_id: "people:roster",
    title: "Who works at LoveIQ — the team and what each person does",
    url: null,
    body,
    meta: {
      kind: "roster",
      people: people.map((p) => p.canonical),
      with_role: withRole.length,
      without_role: withoutRole.length,
    },
    updated_at: stampedAt,
    // The roster describes now, not a past period.
    period_end: null,
  };

  const written = await upsertChunks([row]);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
