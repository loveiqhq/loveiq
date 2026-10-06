import {
  createNotionPage,
  queryNotionDatabase,
  resolveDatabase,
  updateNotionPage,
} from "@features/brain/server/act/notion";
import { meetingOf, parseNextSteps } from "@features/brain/server/promises";
import { readAll } from "@features/brain/server/read-all";

/**
 * CALL NOTES INTO THE CRM: after a recorded call with someone on the Notion board
 * "Therapists & Coaches", the call is filed as a row in "Feedback Sessions", linked to
 * them, and their "Last touch" moves to the day of the call. Plan item A17: Mark's
 * therapist research runs through that CRM, and the debrief after each call was a manual
 * step.
 *
 * WHO WAS ON THE CALL is read two ways, both exact, because a wrong match files one
 * person's call into another's row:
 *  - an address on the calendar event the Gemini notes link to, equal to the row's Email;
 *  - the row's full name as a SPEAKER in the transcript ("Alice Lenhardt: ..."), which
 *    means they talked on the call, not that someone talked about them. A team sync that
 *    discusses a therapist by name is not a call with them.
 * A first name alone is only reported, never filed: the calendar said "Kiu Coates" for the
 * row "Kiu Cortes" (measured 2026-09-25). Adding the email to the row fixes it for good.
 *
 * WHAT IS FILED is what the notes say, never a judgement: the date, the format, the notes
 * link, the next steps and the summary. Outcome, signal strength and the rest are left for
 * whoever ran the call. A call already filed (the same notes link), or a person who already
 * has a session row that day (written by hand), is left alone.
 */

export const CRM_DB = "Therapists & Coaches";
export const SESSIONS_DB = "Feedback Sessions";

export interface Call {
  docId: string;
  title: string;
  url: string;
  date: string;
  summary: string;
  attendees: string[];
  eventTitle: string | null;
  speakers: string[];
}

export interface CrmPerson {
  pageId: string;
  name: string;
  email: string | null;
  lastTouch: string | null;
  sessions: number;
}

export interface SessionRow {
  therapists: string[];
  date: string | null;
  notesLink: string | null;
}

const fold = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const firstName = (s: string) => fold(s).split(" ")[0] ?? "";

/** Speaker labels in a Gemini transcript: a line that starts with a name and a colon. */
export function speakersIn(transcript: string): string[] {
  const out = new Set<string>();
  for (const m of transcript.matchAll(/^([\p{L}][\p{L}'.-]*(?: [\p{L}][\p{L}'.-]*){0,4}):\s/gmu)) {
    out.add(m[1]!.trim());
  }
  return [...out];
}

export type Why = "email" | "speaker";

export function matchCall(
  call: Call,
  people: CrmPerson[]
): {
  matches: Array<{ person: CrmPerson; why: Why }>;
  near: CrmPerson[];
} {
  const attendees = new Set(call.attendees.map((a) => a.toLowerCase().trim()));
  const speakers = new Set(call.speakers.map(fold));
  const matches: Array<{ person: CrmPerson; why: Why }> = [];
  const near: CrmPerson[] = [];
  // A first name in the invite's title ("60 min with Mark (Kiu Coates)"). Not a speaker's
  // first name: a teammate who shares it would flag every sync.
  const titleWords = new Set(fold(call.eventTitle ?? "").split(/[^\p{L}]+/u));
  for (const person of people) {
    if (person.email && attendees.has(person.email.toLowerCase().trim())) {
      matches.push({ person, why: "email" });
    } else if (speakers.has(fold(person.name))) {
      matches.push({ person, why: "speaker" });
    } else {
      const first = firstName(person.name);
      if (first.length >= 3 && titleWords.has(first)) {
        near.push(person);
      }
    }
  }
  return { matches, near };
}

export type SessionType = "Discovery interview" | "Follow-up";

export interface Filing {
  call: Call;
  people: CrmPerson[];
  why: Why[];
  type: SessionType;
}
export interface Skip {
  call: Call;
  people: CrmPerson[];
  reason: string;
}
export interface NearMiss {
  call: Call;
  person: CrmPerson;
}

/** What to file, what to leave, and what nearly matched. Newest call first. */
export function planFiling(
  calls: Call[],
  people: CrmPerson[],
  sessions: SessionRow[]
): { filings: Filing[]; skips: Skip[]; near: NearMiss[] } {
  const filings: Filing[] = [];
  const skips: Skip[] = [];
  const near: NearMiss[] = [];
  const seenBefore = new Set<string>();
  // Oldest first, so a person's first call in the window is the discovery interview.
  for (const call of [...calls].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = matchCall(call, people);
    near.push(...m.near.map((person) => ({ call, person })));
    if (!m.matches.length) continue;
    const who = m.matches.map((x) => x.person);
    if (sessions.some((s) => s.notesLink === call.url)) {
      skips.push({ call, people: who, reason: "already filed" });
      continue;
    }
    const open = m.matches.filter(
      ({ person }) =>
        !sessions.some(
          (s) => s.therapists.includes(person.pageId) && s.date?.slice(0, 10) === call.date
        )
    );
    if (!open.length) {
      skips.push({ call, people: who, reason: `already has a session row on ${call.date}` });
      continue;
    }
    const first = open.every(
      ({ person }) => person.sessions === 0 && !seenBefore.has(person.pageId)
    );
    for (const { person } of open) seenBefore.add(person.pageId);
    filings.push({
      call,
      people: open.map((x) => x.person),
      why: open.map((x) => x.why),
      type: first ? "Discovery interview" : "Follow-up",
    });
  }
  const newest = <T extends { call: Call }>(list: T[]) =>
    list.sort((a, b) => b.call.date.localeCompare(a.call.date));
  return { filings: newest(filings), skips: newest(skips), near: newest(near) };
}

/** Gemini's own prompts inside its notes, which say nothing about the call. */
const BOILERPLATE =
  /^(please rate|let us know what you think|we've updated|do the screenshots|you should review gemini|get tips and learn|meeting records)/i;

export function sessionBody(call: Call): string {
  const summary = call.summary
    .split("\n")
    .filter((l) => !BOILERPLATE.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return (
    `Filed from the Gemini notes of this call: ${call.url}\n\n` +
    "Outcome, signal strength, what landed and the other judgement fields are left for " +
    "whoever ran the call.\n\n" +
    summary
  );
}

export function nextStepsOf(call: Call): string {
  return parseNextSteps(call.summary)
    .map((s) => `[${s.owners.join(", ")}] ${s.title}: ${s.detail}`)
    .join("\n");
}

export interface CrmDeps {
  calls: (since: string) => Promise<Call[] | null>;
  crm: () => Promise<{ people: CrmPerson[]; sessions: SessionRow[] } | null>;
  create: (input: Parameters<typeof createNotionPage>[0]) => Promise<{
    url: string | null;
    droppedBlocks: number;
  }>;
  touch: (pageId: string, day: string) => Promise<void>;
}

export interface Filed extends Filing {
  url?: string | null;
  error?: string;
  /** People whose "Last touch" could not be moved, after the row was written. */
  untouched?: string[];
  droppedBlocks?: number;
}

export interface CrmResult {
  calls: number;
  filed: Filed[];
  skips: Skip[];
  near: NearMiss[];
  gaps: string[];
}

export async function fileCrmCalls(
  since: string,
  dryRun: boolean,
  deps: CrmDeps
): Promise<CrmResult> {
  const [calls, crm] = await Promise.all([
    deps.calls(since).catch(() => null),
    deps.crm().catch(() => null),
  ]);
  const gaps = [
    ...(calls ? [] : ["The meeting notes could not be read."]),
    ...(crm ? [] : [`The Notion boards "${CRM_DB}" and "${SESSIONS_DB}" could not be read.`]),
  ];
  if (!calls || !crm) return { calls: calls?.length ?? 0, filed: [], skips: [], near: [], gaps };
  const plan = planFiling(calls, crm.people, crm.sessions);
  const filed: Filed[] = [];
  for (const f of plan.filings) {
    if (dryRun) {
      filed.push(f);
      continue;
    }
    try {
      const next = nextStepsOf(f.call);
      const page = await deps.create({
        parent: SESSIONS_DB,
        title: `${f.people.map((p) => p.name.trim()).join(" & ")} - ${f.type}`,
        content: sessionBody(f.call),
        properties: {
          Date: f.call.date,
          Format: "Video call",
          "Session type": f.type,
          "Notes link": f.call.url,
          ...(next ? { "Next step": next } : {}),
        },
        rawProperties: { Therapist: { relation: f.people.map((p) => ({ id: p.pageId })) } },
      });
      const untouched: string[] = [];
      for (const p of f.people) {
        if (p.lastTouch && p.lastTouch.slice(0, 10) >= f.call.date) continue;
        await deps.touch(p.pageId, f.call.date).catch(() => untouched.push(p.name.trim()));
      }
      filed.push({
        ...f,
        url: page.url,
        ...(untouched.length ? { untouched } : {}),
        ...(page.droppedBlocks ? { droppedBlocks: page.droppedBlocks } : {}),
      });
    } catch (err) {
      filed.push({ ...f, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { calls: calls.length, filed, skips: plan.skips, near: plan.near, gaps };
}

// ── Reading ─────────────────────────────────────────────────────────────────────────

interface NoteChunk {
  source_id: string;
  title: string | null;
  url: string | null;
  body: string;
  period_end: string | null;
  meta: { links?: string[]; section?: string; part?: number } | null;
}

/** The recorded calls since `since`, one per notes document, with who was on each. */
export async function readCalls(since: string): Promise<Call[] | null> {
  const chunks = await readAll<NoteChunk>(
    `/rest/v1/brain_chunk?select=source_id,title,url,body,period_end,meta` +
      `&source=eq.drive&meta->>kind=eq.meeting-notes&period_end=gte.${since}&order=source_id.asc`
  );
  if (!chunks) return null;
  const docs = new Map<string, NoteChunk[]>();
  for (const c of chunks) {
    const id = c.source_id.replace(/#\d+$/, "");
    docs.set(id, [...(docs.get(id) ?? []), c]);
  }
  const links = [...new Set(chunks.flatMap((c) => c.meta?.links ?? []))]
    .filter((l) => l.startsWith("calendar/"))
    .map((l) => l.slice("calendar/".length));
  const events = new Map<string, { title: string; attendees: string[] }>();
  if (links.length) {
    const rows = await readAll<{
      source_id: string;
      title: string | null;
      meta: { attendees?: string[] } | null;
    }>(
      `/rest/v1/brain_chunk?select=source_id,title,meta&source=eq.calendar` +
        `&source_id=in.(${links.map((l) => `%22${encodeURIComponent(l)}%22`).join(",")})&order=id.asc`
    );
    if (!rows) return null;
    for (const r of rows) {
      events.set(r.source_id, {
        title: (r.title ?? "").replace(/^Meeting:\s*/, ""),
        attendees: r.meta?.attendees ?? [],
      });
    }
  }
  const part = (c: NoteChunk) => c.meta?.part ?? 1;
  return [...docs.entries()].map(([docId, parts]) => {
    parts.sort((a, b) => part(a) - part(b));
    const head = parts[0]!;
    const linked = (head.meta?.links ?? [])
      .map((l) => events.get(l.replace(/^calendar\//, "")))
      .filter((e): e is { title: string; attendees: string[] } => Boolean(e));
    const text = (section: string) =>
      parts
        .filter((p) => p.meta?.section === section)
        .map((p) => p.body)
        .join("\n");
    return {
      docId,
      title: (head.title ?? "")
        .replace(/^Meeting notes:\s*/, "")
        .replace(/\s*\(part \d+ of \d+\)$/, ""),
      url: head.url ?? "",
      date: meetingOf(head.title ?? "", head.period_end ?? "").date,
      summary: text("summary"),
      attendees: linked.flatMap((e) => e.attendees),
      eventTitle: linked[0]?.title ?? null,
      speakers: speakersIn(text("transcript")),
    };
  });
}

type Props = Record<string, Record<string, unknown> | undefined>;
const plain = (v: unknown) =>
  Array.isArray(v)
    ? v.map((t) => String((t as { plain_text?: string }).plain_text ?? "")).join("")
    : "";
const dateOf = (p: Props, name: string) =>
  ((p[name]?.date as { start?: string } | null)?.start ?? null) || null;
const relationOf = (p: Props, name: string) =>
  ((p[name]?.relation as Array<{ id: string }> | undefined) ?? []).map((r) => r.id);

/** The CRM and its session rows, read live from Notion. */
export async function readCrm(): Promise<{ people: CrmPerson[]; sessions: SessionRow[] }> {
  const [people, sessions] = await Promise.all([
    resolveDatabase(CRM_DB),
    resolveDatabase(SESSIONS_DB),
  ]);
  const [pRows, sRows] = await Promise.all([
    queryNotionDatabase(people.id),
    queryNotionDatabase(sessions.id),
  ]);
  return {
    people: pRows.map((r) => {
      const p = r.properties as Props;
      return {
        pageId: r.id,
        name: plain(p[people.titleProperty]?.title),
        email: (p.Email?.email as string | null | undefined) ?? null,
        lastTouch: dateOf(p, "Last touch"),
        sessions: relationOf(p, SESSIONS_DB).length,
      };
    }),
    sessions: sRows.map((r) => {
      const p = r.properties as Props;
      return {
        therapists: relationOf(p, "Therapist"),
        date: dateOf(p, "Date"),
        notesLink: (p["Notes link"]?.url as string | null | undefined) ?? null,
      };
    }),
  };
}

export function liveCrmDeps(): CrmDeps {
  return {
    calls: readCalls,
    crm: readCrm,
    create: createNotionPage,
    touch: (pageId, day) => updateNotionPage(pageId, { "Last touch": { date: { start: day } } }),
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────────────

const callLabel = (c: Call) => `${c.date} "${c.eventTitle ?? c.title}"`;
const names = (people: CrmPerson[]) => people.map((p) => p.name.trim()).join(" & ");

export function renderCrmCalls(r: CrmResult, dryRun: boolean, since: string): string {
  const out: string[] = [
    `Recorded calls since ${since}: ${r.calls}. Filed into "${SESSIONS_DB}" when someone on ` +
      `"${CRM_DB}" was on the call, by their email on the invite or their name as a speaker.`,
  ];
  if (r.gaps.length) out.push(`Not read: ${r.gaps.join(" ")}`);
  if (r.filed.length) {
    out.push(
      (dryRun ? "Would file (nothing was written; pass dry_run: false to file):\n" : "Filed:\n") +
        r.filed
          .map((f) => {
            const why = [...new Set(f.why)].map((w) =>
              w === "email" ? "their email" : "their name as a speaker"
            );
            const tail = f.error
              ? ` → NOT filed: ${f.error}`
              : f.url
                ? ` → ${f.url}${f.untouched ? ` (Last touch not updated for ${f.untouched.join(", ")})` : ""}`
                : "";
            return `- ${callLabel(f.call)} → ${names(f.people)} (matched by ${why.join(" and ")}), as ${f.type}${tail}`;
          })
          .join("\n")
    );
  } else if (!r.gaps.length) {
    out.push("Nothing new to file.");
  }
  if (r.skips.length) {
    out.push(
      "Left alone:\n" +
        r.skips.map((s) => `- ${callLabel(s.call)} → ${names(s.people)}: ${s.reason}.`).join("\n")
    );
  }
  if (r.near.length) {
    out.push(
      "Possible matches, not filed because only a first name agrees:\n" +
        r.near
          .map(
            (n) =>
              `- ${callLabel(n.call)} might be ${n.person.name.trim()}. Add their email to the Notion ` +
              "row, or correct the name, and it is filed on the next run."
          )
          .join("\n")
    );
  }
  return out.join("\n\n");
}
