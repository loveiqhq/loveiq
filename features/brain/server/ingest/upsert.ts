import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { loadPeople, peopleIn } from "@features/brain/server/people";

/**
 * Shared write path for every non-git ingester (Jira, Google analytics).
 *
 * The repo ingester in `scripts/brain-ingest-repo.mjs` deliberately does NOT use
 * this: it runs in a GitHub Action with no Next.js module graph, so it speaks to
 * PostgREST directly. The two implementations agree on the contract that matters
 * — upsert on (source, source_id), then sweep by `updated_at` — and that contract
 * is enforced by the UNIQUE constraint, not by shared code.
 */

export interface BrainRow {
  source: string;
  source_id: string;
  title: string;
  url: string | null;
  body: string;
  meta: Record<string, unknown>;
  updated_at: string;
  /**
   * The period this chunk DESCRIBES — not when it was ingested.
   *
   * `updated_at` cannot order by recency: it is stamped once per run, so
   * `count(distinct updated_at)` was 1 across all 171 analytics chunks and the
   * `ORDER BY score DESC, updated_at DESC` tie-break was a no-op. With scores
   * tying 0.002 apart that made "the most recent month" effectively random —
   * "revenue?" answered with May. Null where a period is meaningless (docs).
   */
  period_end?: string | null;
}

const BATCH = 200;

/** Postgres text columns reject NUL bytes outright (SQLSTATE 22021). */
const NUL_BYTE = String.fromCharCode(0);

/** Matches the ceiling the repo ingester enforces, so every source is chunked
 *  to a comparable size and no single row can dominate a prompt. */
const MAX_BODY_CHARS = 2400;

/**
 * Credential shapes that must never enter the corpus.
 *
 * Indexing a secret is not the same as sharing a document. `brain_chunk` is
 * searchable by everyone, its contents are pasted into every LLM prompt that
 * retrieves them, and the free-tier model provider may train on those prompts —
 * so one indexed key becomes several copies in places it can never be recalled
 * from. LoveIQ's open-access policy is about people reading information; it is
 * not a decision to publish credentials.
 *
 * Deliberately PREFIXED patterns only. A generic "long opaque string" rule would
 * silently drop legitimate chunks — git SHAs, base64, ids — and a guard that eats
 * real content is worse than no guard.
 */
const CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ["github", /gh[pousr]_[A-Za-z0-9]{16,}/],
  ["github-fine-grained", /github_pat_[A-Za-z0-9_]{20,}/],
  ["notion", /\b(?:ntn_|secret_)[A-Za-z0-9]{24,}/],
  ["google-api-key", /AIza[A-Za-z0-9_-]{30,}/],
  ["google-oauth-secret", /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ["slack", /xox[baprse]-[A-Za-z0-9-]{16,}/],
  ["stripe", /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["stripe-webhook", /whsec_[A-Za-z0-9]{24,}/],
  ["openai-anthropic", /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\./],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY/],
  ["aws", /\bAKIA[0-9A-Z]{16}\b/],
  // PostHog: phx_ is a Personal API Key (read/write on the account), phs_ a
  // session key. phc_ is the PUBLIC project token that ships in client-side
  // JavaScript, so it is deliberately NOT here — refusing it would drop real
  // documentation about our own analytics setup for no security gain.
  ["posthog", /\bph[xs]_[A-Za-z0-9]{32,}/],
  ["resend", /\bre_[A-Za-z0-9]{24,}/],
  ["calendly", /\beyJraWQ/], // Calendly PATs are JWTs; caught above too, kept for the label
  // Vercel: vcp_ is a PROJECT-scoped access token, vct_/vca_ the team and user
  // variants. Any of them can deploy or read project config, so none belongs in
  // a searchable table.
  ["vercel", /\bvc[pta]_[A-Za-z0-9]{24,}/],
  // Figma personal access token.
  ["figma", /\bfigd_[A-Za-z0-9_-]{24,}/],
];

/**
 * Query parameters whose VALUE is authentication material.
 *
 * SEPARATE FROM `CREDENTIAL_PATTERNS`, AND REDACTED RATHER THAN REFUSED, because
 * these two kinds of secret want opposite handling. A Stripe key in a chunk means
 * the whole chunk is a leak and losing it costs nothing. A one-time link is
 * different: mailboxes are full of them, they sit inside ordinary threads that DO
 * carry content, and one of the shapes below (`?token=`) is also our own
 * unsubscribe link — so refusing the chunk would delete real email to remove a
 * parameter. Masking the value keeps the thread and takes the secret.
 *
 * Why this is not theoretical. `/api/cron/brain-gmail` runs hourly and an admin
 * magic link is valid for one hour, so a link mailed at :05 was searchable at :11
 * with most of its life left — and `brain_chunk` is read by everyone and pasted
 * into model prompts. Measured on 2026-09-09, before this: 10 chunks carrying
 * `token_hash=`, 10 `?token=`, plus Supabase signup verifications and a third-party
 * password reset.
 *
 * ponytail: URL parameters only. A code quoted in prose ("your code is 123456") is
 * not caught — it is not directly usable without the matching session, and every
 * pattern loose enough to catch it also eats "the error code is 404". Revisit if a
 * provider starts mailing bearer tokens as prose.
 */
const SECRET_PARAMS = [
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "id_token",
  "auth",
  "code",
  "otp",
  "secret",
  "password",
  "passwd",
  "pwd",
  "api_key",
  "apikey",
  "key",
  "sig",
  "signature",
  "session",
  "uart", // Upwork's password-reset parameter, found live in the mailbox
];

/**
 * The parameter name may carry any prefix -- `auth_token`, `invitation_token`,
 * `reset_secret`. Enumerating exact names missed three live chunks, one of them a
 * GitHub organisation-join credential, because `[?&#]` had to sit immediately before
 * the listed word.
 *
 * NO LENGTH FLOOR. It started at 8 to avoid masking trivia, and a mail client wrapping
 * a long URL leaves as few as two characters after `token=` on the first line -- so the
 * floor skipped exactly the lines that needed it and left the whole link readable.
 * There is no value in a short auth parameter that is worth printing, so any non-empty
 * one is masked.
 */
const SECRET_PARAM_RE = new RegExp(
  `([?&#][a-z0-9_.-]*(?:${[...SECRET_PARAMS].sort((a, b) => b.length - a.length).join("|")})=)` +
    /**
     * REFUSE A VALUE THAT IS ALREADY THE MASK, or this rule eats itself.
     *
     * The value class below excludes `]` so a URL inside brackets or markdown is not
     * swallowed whole. That means `&token=abc]` redacts to `&token=[redacted]]` — and on
     * the NEXT pass the same rule matches `[redacted` (stopping at that first `]`) and
     * masks it again, producing `[redacted]]]`. Every subsequent run appends one more.
     *
     * Not theoretical: found on 2026-09-17 in a calendar chunk holding a Deutsche Bahn
     * booking link, where four passes added four brackets. Bodies are capped at
     * MAX_BODY_CHARS, so a chunk that is re-ingested often would have real text pushed
     * off the end one character at a time, invisibly.
     */
    `(?!\\[redacted\\])` +
    `[^\\s&"'<>)\\]]+`,
  "gi"
);

/**
 * SECRETS THAT ARE NOT QUERY PARAMETERS AT ALL.
 *
 * A report-unlock link is `https://www.loveiq.org/report/rpt_<20 chars>` -- the token is
 * a PATH SEGMENT, so it carries no `?`, `&` or `#` and the parameter rule above could
 * never see it. Measured 2026-09-10: 117 chunks held one, 86 of them reachable by an
 * ordinary search, and one landed in the same response as the decision saying customer
 * data must never reach a model prompt. `/report/<token>` opens a paid personal report
 * with no login, and there were 1,933 live tokens.
 *
 * Prefixed shapes only, for the same reason `CREDENTIAL_PATTERNS` is: a generic
 * "long opaque string in a path" rule would eat Drive file ids, Notion page ids and
 * message permalinks, and a guard that eats real content is worse than no guard.
 */
const BARE_SECRET_RE = new RegExp(
  [
    // Verified against the live tables rather than guessed: `report_access_token.token`
    // is `rpt_` + 20, `report_share.share_token` is `rpts_` + 20, and
    // `prepaid_report_access.prepaid_token` is `rpp_` + 32. Two of these were invented
    // on a first pass ("shr_", "ppd_") and matched nothing at all.
    "rpts?_[A-Za-z0-9_-]{12,}", // report access + share tokens
    "rpp_[A-Za-z0-9_-]{12,}", // prepaid report access token
    // Third-party one-click links found live in the mailbox and in Slack. Each one acts
    // on a named customer with no authentication: the Calendly link CANCELS their
    // booking, the customer.io link unsubscribes them, and a Stripe receipt shows the
    // payer's name, email and card.
    "calendly\\.com/cancellations/[A-Za-z0-9-]{8,}",
    "track\\.customer\\.io/(?:\\S*?/)?unsubscribe/[A-Za-z0-9_-]{8,}",
    "pay\\.stripe\\.com/receipts/[A-Za-z0-9_/-]{12,}",
    /**
     * Any JSON Web Token, whoever issued it.
     *
     * `eyJ` is base64url for `{"`, so this shape is a base64 JSON object followed by at
     * least one more base64 segment — a token by construction, never prose. That makes it
     * safe to mask generically, unlike the "long opaque string in a path" rule this file
     * refuses to write: nobody loses meaning when a JWT becomes `[redacted]`.
     *
     * Found by audit 2026-09-17: 60 live, unexpired tokens issued by `pub-0` sat in
     * newsletter mail the mailbox receives. Those carried no customer identity and were
     * low severity — but they were live, and the next one might be ours.
     */
    "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}(?:\\.[A-Za-z0-9_-]+)?",
  ].join("|"),
  "g"
);

/**
 * Mask the value of any authentication parameter, keeping the surrounding text.
 *
 * The parameter NAME survives on purpose: a reader who needs to know an email
 * carried a magic link can still see that it did, and can go to the mailbox.
 */
export function redactUrlSecrets(text: string): string {
  return text.replace(SECRET_PARAM_RE, "$1[redacted]").replace(BARE_SECRET_RE, "[redacted]");
}

/**
 * Gemini names every note "… - Notes by Gemini", which is the only reliable marker on
 * the file itself. Shared so the classifier below and the row builder cannot drift
 * apart — the classifier MUST spare a meeting, and it would not if the two diverged.
 */
export const MEETING_NOTE_NAME = /notes by gemini/i;

/**
 * A SIGNED LEGAL INSTRUMENT — the company's contracts and colleagues' own terms.
 *
 * Widening the Drive walk on 2026-09-21 made eighteen of these searchable: five named
 * people's freelance agreements, both copies of the shareholders agreement, the VSOP
 * option terms, eight per-person confidentiality and data-protection agreements, and
 * two freelance contract templates. Between them, thirty chunks carry monetary terms —
 * so anyone who can query the brain could read a named colleague's rate, or the cap
 * table, by asking in prose.
 *
 * Eman's call, 2026-09-22, and consistent with the one made about CVs two days
 * earlier: somebody's contract is their business, not company knowledge. The audience
 * is the same team that can already open the shared Drive, so this is about what is
 * easy to stumble into rather than about a leak — which is why it is a decision and
 * not an incident.
 *
 * WHAT IT DELIBERATELY SPARES, each verified against all 814 Drive documents:
 *
 *  - Meeting notes. "Eman <> Mark - Contract Sync" is people TALKING about a contract,
 *    which is exactly the kind of thing the brain exists to remember.
 *  - The plural. "Development Agreements.md" is the development team's working norms
 *    ("one clearly responsible leader … 2-week time-boxed sprints") and is real
 *    operational knowledge. An instrument is "an Agreement"; a list of norms is
 *    "Agreements".
 *  - Analysis about law. The dating-app legal-compliance strategy papers (German and
 *    English) and the EU/DE compliance summary are papers we want found, and carry
 *    neither word in their titles, so they were never at risk — checked, not assumed.
 *
 * Measured before shipping: 18 of 814 documents, 197 of 12,452 chunks (1.58%), with
 * every near miss inspected by hand.
 *
 * REVERSIBLE, like the CV rule: delete this function and its call and the next walk
 * puts them back. The rows already indexed go on their own — the filter runs before
 * `toFetch`/`touch`/`deferred`, so an excluded document looks ABSENT to the sweep
 * rather than merely unfetched, which is how the vendor invoices left.
 */
const LEGAL_INSTRUMENT =
  /(agreement|contract)([ _.]|$)|confidentiality,? data protection|vsop|terms[ _]of[ _]options|articles of association|gesellschaftsvertrag|gesellschafter/i;
export function isLegalInstrument(name?: string): boolean {
  // Percent-decoded first. One data-protection agreement reached the corpus with its
  // spaces URL-encoded by Drive, which also left the word "Agreement" truncated — so
  // the rule read the name as an ordinary file and indexed it. Decoding is the fix;
  // matching on the truncated stem instead would have caught every "Agreed plan" in
  // the Drive.
  const n = (name ?? "").replace(/%20/g, " ").trim();
  // A meeting ABOUT a contract is a record of a discussion, not the instrument.
  if (MEETING_NOTE_NAME.test(n)) return false;
  // No `if (!n) return false` guard: it was there and it was dead — neither regex can
  // match an empty string, so deleting the line changed nothing and no test could tell.
  // A line that cannot change an outcome is not a guard, it just reads like one.
  return LEGAL_INSTRUMENT.test(n);
}

/**
 * RECRUITING MATERIAL, judged by name: a CV, a list of applicants, interview notes.
 *
 * The owner's decision (2026-09-20, widened 2026-09-23): job applicants' personal data
 * does not belong in a corpus the whole team can search through a tool that answers in
 * prose. Moved here from drive.ts so every path that reads a named file applies the same
 * rule — Drive documents, Gmail attachments, Slack uploads, calendar titles — because
 * excluding a CV from Drive while indexing the same CV as an email attachment is the
 * "one document, three ingest paths" failure the legal-instrument rule already hit.
 *
 * History: fifteen named CVs (23 chunks) were indexed until 2026-09-20, when the CV
 * clause went in. Measured across every indexed Drive document on 2026-09-23, the two new
 * clauses select exactly four applicant spreadsheets and three interview notes, and
 * nothing else. "Interview" is carved out when the name says it is research, so a
 * user-research session is not mistaken for a hiring one.
 *
 * A KNOWN EDGE, recorded in the tests rather than fixed: a document ABOUT screening CVs
 * that leads with the word ("CV screening process") is dropped too, because a real CV
 * leads with it identically. An earlier comment claimed the opposite; the test was right.
 *
 * REVERSIBLE, and a decision rather than a defect: to let the brain answer who applied
 * for a role, delete this function and its calls.
 */
const JOB_APPLICATION = /(^|[_\s(-])(cv|resume|résumé|lebenslauf)([_\s).\d-]|$)/i;
const APPLICANTS = /\bapplicants?\b/i;
const INTERVIEW = /\binterview\b/i;
const RESEARCH_INTERVIEW = /\b(user|customer|research|participant|podcast|press)\b/i;
export function isJobApplication(name?: string): boolean {
  const n = (name ?? "").trim();
  if (JOB_APPLICATION.test(n) || APPLICANTS.test(n)) return true;
  return INTERVIEW.test(n) && !RESEARCH_INTERVIEW.test(n);
}

/**
 * A RECRUITING CONVERSATION, judged by what the meeting notes say about themselves.
 *
 * Needed because the name is not enough: candidate calls are booked through a generic
 * "30 min with Mark (<name>)" slot that also carries partner and domain conversations.
 * Gemini's own summary names a hiring call as one — "recruitment discussion", "candidate
 * fit". Measured 2026-09-23 across every Drive document: these phrases select exactly the
 * five candidate interviews. "Hiring decision" was tried and rejected: it also selected
 * two team syncs that merely discussed hiring, and a whole sync must not be refused.
 */
const RECRUITING_CONVERSATION =
  /(recruitment (discussion|interview|conversation|call)|candidate('s)? (qualifications|fit|suitability|background)|evaluation of (the )?candidate|interview(ed)? (for|of) (the|a) (position|role))/i;
export function isRecruitingConversation(text: string): boolean {
  return RECRUITING_CONVERSATION.test(text);
}

/** The credential kind found in this text, or null. */
export function credentialKind(text: string): string | null {
  for (const [kind, pattern] of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

function clean(row: BrainRow): BrainRow {
  return {
    ...row,
    title: redactUrlSecrets(row.title.split(NUL_BYTE).join("")),
    // Redacted BEFORE the length cap, so a masked value cannot push real text out.
    body: redactUrlSecrets(row.body.split(NUL_BYTE).join("")).slice(0, MAX_BODY_CHARS),
    // `url` too. It was the one field of the three left unguarded, and `renderSources`
    // prints it on every search line — 588 chunks carry a query string there. Nothing
    // leaked through it today; a field that is exempt by omission is how the next one does.
    url: row.url === null ? null : redactUrlSecrets(row.url),
    // PostgREST rejects a bulk insert whose objects do not all carry the SAME
    // keys — "All object keys must match" (PGRST102), and it fails the whole
    // batch, not the offending row. `period_end` is optional, and JSON.stringify
    // drops `undefined`, so one row without it breaks every other row in the
    // batch. Normalising to an explicit null here means no caller has to know.
    period_end: row.period_end ?? null,
  };
}

export async function upsertChunks(rows: BrainRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  /**
   * ONE PLACE, SO EVERY SOURCE GAINS IT AT ONCE.
   *
   * `meta.people` is derived here rather than in seven ingesters, for the same reason the
   * credential refusal below lives here: a rule each caller has to remember is a rule
   * that will be forgotten by the eighth. Every ingester already records identity in some
   * field -- author, participants, owner, assignee, speakers, organizer, attendees -- and
   * this is the only step that turns those into one name.
   *
   * A registry that cannot be read leaves `meta.people` UNSET, never empty. An empty
   * array asserts "nobody here", and stripping the field from a whole run would look
   * exactly like a corpus in which nobody wrote anything.
   */
  const byAlias = await loadPeople();

  // A duplicate key inside ONE batch makes Postgres raise "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" and fails the whole request, so
  // de-duplicate here rather than trusting every caller to.
  const byKey = new Map<string, BrainRow>();
  for (const row of rows) {
    // Refused at the shared write path, so every source is covered and no
    // ingester has to remember. Logged with the title and never the value, so
    // someone can go and rotate it.
    /**
     * REDACT BEFORE JUDGING.
     *
     * `redactUrlSecrets` already removes a token sitting in a URL query, and
     * `clean()` applies it on the way out — but the refusal below was reading the
     * RAW text, so a part was thrown away for a secret that would have been stripped
     * a few lines later. Measured 2026-09-19: 126 parts across 35 documents were
     * refused, every one of them a JWT in a Confluence or Jira action link. The
     * tokens are single-use and the surrounding email was lost for nothing.
     *
     * The guard is not weakened: `credentialKind` still runs, just on the text that
     * would actually be stored. Anything redaction cannot remove is still refused.
     */
    const redacted = {
      ...row,
      title: redactUrlSecrets(row.title),
      body: redactUrlSecrets(row.body),
    };
    const kind = credentialKind(`${redacted.title}\n${redacted.body}`);
    if (kind) {
      logger.warn(
        { source: row.source, sourceId: row.source_id, kind, url: row.url },
        "brain: refusing to index a chunk containing a credential — rotate it and remove it from the source"
      );
      /**
       * LEAVE A MARKER, NOT A HOLE.
       *
       * `continue` alone dropped the row and said so only to a log line that has
       * rolled off by the time anyone looks. Its SIBLINGS still say "part 2 of 2",
       * so a reader gets a fragment of a document with nothing to say a piece is
       * missing or why. Measured 2026-09-19: 26 gmail threads were in exactly that
       * state — 2FA mails, Jira invites, signup links, all of which legitimately
       * carry a token in their first part.
       *
       * The marker indexes NO secret: the body is fixed text, and the title is kept
       * only when the title on its own is clean, since `kind` may have come from it.
       */
      const titleHoldsIt = credentialKind(redacted.title) !== null;
      byKey.set(
        `${row.source} ${row.source_id}`,
        clean({
          ...redacted,
          title: titleHoldsIt ? `${row.source}: withheld` : redacted.title,
          body:
            `This part is deliberately not indexed: it contains a ${kind}, which must ` +
            `not become searchable. Rotate it and remove it from the source. The rest ` +
            `of this document is indexed normally.`,
          meta: { ...(row.meta ?? {}), withheld: kind },
        })
      );
      continue;
    }
    const people = peopleIn(row.meta ?? {}, byAlias);
    byKey.set(
      `${row.source} ${row.source_id}`,
      // `row`, not `redacted`: `clean()` redacts on the way out regardless, so passing
      // the pre-redacted copy here changes nothing. Mutation proved it — swapping them
      // broke no test, because the two produce identical bytes.
      clean(people ? { ...row, meta: { ...(row.meta ?? {}), people } } : row)
    );
  }
  const unique = [...byKey.values()];

  let written = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const res = await supabaseFetch("/rest/v1/brain_chunk?on_conflict=source,source_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
      /**
       * The shared 8s default is a READ timeout and is far too short for this.
       * A batch of email threads is ~2,400 characters per row plus a regenerated
       * tsvector for each, and the multi-mailbox Gmail run died exactly here:
       * "Request timeout after 8000ms" — after successfully fetching every
       * mailbox, so the whole walk was thrown away at the last step.
       */
      timeoutMs: 45_000,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`brain_chunk upsert failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    written += batch.length;
  }
  /**
   * A MARKER IS NOT AN INDEXED CHUNK, and the count callers act on must say so.
   *
   * `record_decision` reports success from this number. When the decision it was
   * asked to record contained a credential, the marker made the row count 1 and the
   * caller was told the decision had been recorded — while what is actually stored
   * says the content was withheld. A guard that reports success is worse than the
   * hole it replaced; the existing test caught this the moment markers were added.
   *
   * Counted off the deduped set rather than incremented at the refusal, so a marker
   * later overwritten by a clean row with the same key is not subtracted twice.
   */
  const withheld = unique.filter(
    (r) => (r.meta as { withheld?: unknown } | undefined)?.withheld
  ).length;
  // Only after every batch landed: a write that failed threw above and deletes nothing.
  await dropLeftoverParts(unique);
  return written - withheld;
}

/** `thread:abc#3` -> `thread:abc`. An id with no numeric part suffix is its own base. */
export function partBase(sourceId: string): string {
  return sourceId.replace(/#\d+$/, "");
}

/**
 * The stored rows of a rewritten document that its new version did not write.
 *
 * WHY THIS EXISTS. A document that re-chunks SHORTER leaves its old tail behind, and
 * until now only the daily sweep removed it, so for up to a day search could return a
 * part of a version that no longer exists: after the gmail v9 rebuild there were 1,986
 * such parts. `fetch_document` already hides them (`dropLeftoverParts` in the route);
 * search, browse and the brief could not.
 *
 * The rule is "stored minus written, per document", which holds for every numbering the
 * sources use: part 1 on the bare id with `#2…#N` after it (gmail, drive, notion), and a
 * document that grew from one part to several or shrank back. It is safe because every
 * caller of `upsertChunks` passes all the parts of a document in ONE call (checked for
 * each of them on 2026-09-24): the parts written here are the complete new version, so
 * anything else stored under the same base is from an older one. A document this call did
 * not write is never looked at, so a failed or skipped read deletes nothing, as the sweep's
 * rules require.
 */
export function leftoverParts(stored: Iterable<string>, written: ReadonlySet<string>): string[] {
  const bases = new Set([...written].map(partBase));
  return [...stored].filter((id) => !written.has(id) && bases.has(partBase(id)));
}

/** Documents looked up per request. Pages of 1,000 ids are read until one comes back short. */
const LEFTOVER_LOOKUP = 25;

const quoted = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** The stored ids of these documents, or null when they could not be read. */
async function storedPartIds(source: string, bases: string[]): Promise<string[] | null> {
  // The base itself exactly, and its numbered parts by prefix. The prefix over-selects
  // (another id that starts the same way, and LIKE's `_` wildcard); `leftoverParts`
  // filters exactly, so an extra row read is never an extra row deleted.
  const or = bases
    .flatMap((b) => [`source_id.eq.${quoted(b)}`, `source_id.like.${quoted(`${b}#*`)}`])
    .join(",");
  const out: string[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id&source=eq.${encodeURIComponent(source)}` +
        `&or=(${encodeURIComponent(or)})&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) return null;
    const batch = (await res.json().catch(() => null)) as Array<{ source_id?: string }> | null;
    if (!Array.isArray(batch)) return null;
    for (const r of batch) if (r?.source_id) out.push(r.source_id);
    if (batch.length < 1000) break;
  }
  return out;
}

/**
 * Delete the leftover parts of the documents just written. Never throws: the write
 * already succeeded, and anything this misses the daily sweep still removes.
 */
async function dropLeftoverParts(rows: BrainRow[]): Promise<number> {
  const writtenBySource = new Map<string, Set<string>>();
  for (const r of rows) {
    const ids = writtenBySource.get(r.source) ?? new Set<string>();
    ids.add(r.source_id);
    writtenBySource.set(r.source, ids);
  }
  let dropped = 0;
  try {
    for (const [source, written] of writtenBySource) {
      const bases = [...new Set([...written].map(partBase))];
      for (let i = 0; i < bases.length; i += LEFTOVER_LOOKUP) {
        const stored = await storedPartIds(source, bases.slice(i, i + LEFTOVER_LOOKUP));
        if (!stored) {
          logger.warn({ source }, "brain: could not look up leftover parts; the sweep will");
          return dropped;
        }
        const leftovers = leftoverParts(stored, written);
        for (let j = 0; j < leftovers.length; j += 100) {
          const list = leftovers
            .slice(j, j + 100)
            .map(quoted)
            .join(",");
          const res = await supabaseFetch(
            `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}` +
              `&source_id=in.(${encodeURIComponent(list)})`,
            { method: "DELETE", headers: { Prefer: "return=minimal" } }
          );
          if (!res.ok) {
            logger.warn({ source, status: res.status }, "brain: leftover-part delete failed");
            return dropped;
          }
          dropped += Math.min(100, leftovers.length - j);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "brain: leftover-part cleanup stopped; the sweep will finish it");
  }
  if (dropped > 0)
    logger.info({ dropped }, "brain: removed leftover parts of re-chunked documents");
  return dropped;
}

/**
 * Delete rows of one source that this run did not rewrite — a deleted Jira issue,
 * a date that fell out of the window.
 *
 * ONLY CALL THIS AFTER A COMPLETE RUN. Sweeping after a partial run deletes
 * everything the run never reached, which silently empties the corpus.
 *
 * `wroteRows` is required rather than advisory, because "the upstream answered"
 * is not the same as "the run was complete". GA4 omits `rows` entirely for an
 * empty result set and returns 200, so an accessible-but-empty property yielded
 * zero chunks, zero writes, and then a sweep that deleted every ga4 row — and
 * the cron reported `{ok: true}`, so nothing alerted. Refusing to sweep on a
 * zero-write run makes that unreachable for every caller instead of asking four
 * of them to remember.
 */
/**
 * Bump `updated_at` on rows this run deliberately did NOT rewrite.
 *
 * WHY THIS EXISTS. The sweep deletes any row of a source whose `updated_at` is
 * older than the current run's stamp, which means "keep this row" and "re-fetch
 * this row's content" are the same act — and for Notion that is 1,000+ HTTP
 * requests a night to re-download pages nobody edited. Touching lets a run say
 * "still there, unchanged" for the cost of one request per 100 rows, so a full
 * corpus stays live inside a 45-second cron budget.
 *
 * Batched because the ids travel in the URL as `in.(…)`; 100 uuids is ~4 KB,
 * comfortably inside any proxy's limit.
 *
 * Returns how many rows were confirmed, which the caller adds to its write count
 * before sweeping — otherwise a run that touched 1,000 rows and rewrote 3 looks
 * to `sweepStale` like a run that wrote almost nothing.
 */
export async function touchChunks(
  source: string,
  sourceIds: string[],
  stampedAt: string,
  /**
   * Whether the caller will actually sweep this run. Defaults true, so a caller
   * that always sweeps needs no argument.
   *
   * TOUCHING IS ONLY EVER FOR THE SWEEP, and it is far from free. `updated_at` is
   * an indexed column -- `idx_brain_chunk_source` is `btree (source, updated_at
   * DESC)` -- so a touch can NEVER be a HOT update. Every one rewrites the row and
   * its entries in a 42 MB GIN full-text index, a 30 MB HNSW vector index and a
   * 13 MB trigram index: 227 MB of indexes over a 51 MB heap.
   *
   * Measured on 2026-08-31, after Supabase warned the project was exhausting its
   * Disk IO budget: 30,213 live rows had absorbed 991,115 updates, 0.3% of them
   * HOT -- every row rewritten ~33 times purely to say "still here".
   *
   * Gmail and Drive were mid-re-walk at the time, so `complete` was false and
   * their sweeps never ran, while the touch still did: ~25,000 index-rewriting
   * updates an hour with no consumer whatsoever. Skipping those costs nothing,
   * because when a sweep does run the touch runs in the same pass and stamps
   * everything it saw.
   *
   * The rows still count as CONFIRMED when the write is skipped -- the caller saw
   * them in the walk; only the stamp, which nothing will read, is what we drop.
   */
  willSweep = true
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  if (!willSweep) return sourceIds.length;

  let touched = 0;
  for (let i = 0; i < sourceIds.length; i += 100) {
    const batch = sourceIds.slice(i, i + 100);
    // PostgREST `in.()` needs each value quoted, or a comma or paren inside an
    // id would split the list. Notion ids are uuids, but the ingester prefixes
    // them (`task:`/`page:`) and a future source may not be so tidy.
    const list = batch.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}&source_id=in.(${encodeURIComponent(list)})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=headers-only,count=exact" },
        body: JSON.stringify({ updated_at: stampedAt }),
      }
    );
    if (!res.ok) {
      /**
       * FAIL CLOSED. This used to `continue`, which was the most dangerous line in
       * the ingester: the batch's rows were left with a stale `updated_at` AND
       * excluded from `touched`, so the sweep later in the same run deleted them as
       * orphans. The majority guard only refuses losses above ~50%, so a single
       * transient PostgREST 5xx could silently delete up to half a source.
       *
       * The circuit breaker cannot catch this either — it counts THROWN errors, and
       * `fetchWithTimeout` resolves normally with a 503 Response, so a run of 5xx
       * looks like a series of successes.
       *
       * Throwing aborts before the sweep and surfaces through the cron route's
       * existing catch, which alerts. A stale row is repaired by the next run; a
       * deleted one is gone.
       */
      throw new Error(
        `brain touch failed for ${source} (status ${res.status}, ${batch.length} rows) — ` +
          `aborting before the sweep so those rows are not deleted as orphans`
      );
    }
    // Trust the server's count, not the batch length: a row that no longer
    // exists must not be counted as kept.
    const range = res.headers.get("content-range");
    const n = range ? Number(range.split("/")[1]) : NaN;
    touched += Number.isFinite(n) ? n : batch.length;
  }
  return touched;
}

/**
 * Roughly once a day, not every run.
 *
 * The sweep deletes rows whose source document is gone. That is rare, and the touch
 * it depends on is the brain's most expensive write (see `touchChunks`). Paying a
 * full-corpus rewrite up to 96 times a day to notice a rare deletion is what
 * exhausted the project's Disk IO budget on 2026-08-31.
 *
 * Twenty hours rather than twenty-four so a source does not drift a slot later each
 * day and skip one entirely.
 */
const SWEEP_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * FAILS CLOSED. Any unreadable state answers "do not sweep", because the cost of
 * skipping a sweep is that a deleted document lingers one more day, while the cost
 * of sweeping on bad information is deleted corpus.
 *
 * A source with no row has never swept, so it sweeps on its next complete walk.
 */
export async function shouldSweep(source: string, nowMs = Date.now()): Promise<boolean> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_sweep_state?source=eq.${encodeURIComponent(source)}&select=swept_at`
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep state unreadable, not sweeping");
      return false;
    }
    const rows = (await res.json().catch(() => null)) as Array<{ swept_at?: string }> | null;
    if (!Array.isArray(rows)) return false;
    if (rows.length === 0) return true;
    const last = Date.parse(rows[0]?.swept_at ?? "");
    if (!Number.isFinite(last)) return false;
    return nowMs - last >= SWEEP_INTERVAL_MS;
  } catch (err) {
    logger.warn({ err, source }, "brain sweep state threw, not sweeping");
    return false;
  }
}

/**
 * Recorded on ATTEMPT, not on success. The expensive part -- the touch -- has already
 * happened by the time the sweep runs, so retrying in an hour would repeat the whole
 * cost to reach the same refusal. A sweep the majority guard declined is a signal to
 * look, not a reason to hammer the disk.
 */
export async function recordSweep(source: string, at = new Date().toISOString()): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/brain_sweep_state?on_conflict=source", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ source, swept_at: at }),
    });
  } catch (err) {
    // A lost write means one extra sweep tomorrow. Never worth failing the run.
    logger.warn({ err, source }, "brain sweep state not recorded");
  }
}

/**
 * Delete rows of `source` whose id this run did not see. The touchless sweep.
 *
 * WHY THIS EXISTS ALONGSIDE `sweepStale`. The timestamp sweep needs every surviving
 * row stamped first, and that stamp is the most expensive write in the brain (see
 * `touchChunks`). For the large sources it does not even fit in one invocation:
 * drive is 16,117 rows in 161 batches and gmail 9,074, and both hit the 8s
 * per-request timeout on 2026-08-31 -- gmail at 11:11, drive at 14:52, 15:52 and
 * 16:52. No amount of scheduling fixes a job that cannot finish.
 *
 * The set of ids the run saw is what the sweep always actually meant, and every
 * ingester already holds it in memory. So: zero writes, one paged read, and a DELETE
 * that normally matches nothing.
 *
 * Same two guards as the timestamp version. FAIL CLOSED on any unreadable page,
 * because a short read makes live rows look like orphans; and refuse a majority
 * deletion, because a mass id change (a re-chunking, a shorter window) and a broken
 * collection are indistinguishable from here. Stale rows are recoverable; deleted
 * ones are not.
 */
/**
 * ONE PAGE OF A PAGED `brain_chunk` LISTING, OR THROW.
 *
 * Every ingester builds its "do not delete this" keep set by paging this table, and
 * five of them guarded the STATUS with a carefully-worded fail-closed throw and then
 * swallowed a bad BODY on the very next line:
 *
 *     if (!res.ok) throw new Error("... aborting before the sweep ...");
 *     const batch = (await res.json().catch(() => [])) as Row[];
 *     ...
 *     if (batch.length < 1000) break;
 *
 * `fetchWithTimeout` deliberately leaves the AbortController armed through the body
 * read, so a response that stalls AFTER its headers resolves `ok: true` and then
 * rejects inside `res.json()`. The catch yields `[]`, `0 < 1000` ends the loop, and a
 * TRUNCATED keep set is returned as the complete corpus. The sweep in that same run
 * then deletes every row the missing pages never mentioned, records success, and
 * alerts nobody: page 12 of a 17-page read stalling costs about a quarter of the
 * largest source.
 *
 * Throwing is the right failure. The ingest already turns a throw into a failed run
 * with an ops alert, and a stale row is repaired by the next run while a deleted one
 * is gone.
 *
 * This exists as ONE function because there were eight copies of the read and only
 * two of them had been fixed. Eight copies is the reason the other six were still
 * wrong.
 */
export async function chunkPage<T>(source: string, res: Response): Promise<T[]> {
  if (!res.ok) {
    throw new Error(
      `brain-ingest ${source}: could not read the existing chunk list (status ${res.status}) — ` +
        `aborting before the sweep rather than treating the corpus as empty`
    );
  }
  const batch = (await res.json().catch(() => null)) as T[] | null;
  if (!Array.isArray(batch)) {
    throw new Error(
      `brain-ingest ${source}: a page of the existing chunk list was unreadable — ` +
        `aborting before the sweep rather than treating a truncated list as complete`
    );
  }
  return batch;
}

/**
 * The one line a run leaves behind in `cron_run.error_message`: what it did, and
 * whether it finished.
 *
 * `IngestResult.complete` exists because drive computed the flag and dropped it, so
 * a run that fetched one of three documents recorded a byte-identical row to a
 * complete one. The flag now reaches the routes — and every route then dropped it
 * again, which is the same bug one level up. Gmail is what that cost: its walk had
 * never once completed, and 24 consecutive runs recorded `success` with no message,
 * because a converging re-walk is a deliberate skip and deliberate skips said
 * nothing at all.
 *
 * `status` still answers "should anyone worry". This answers "what happened", which
 * is the question you cannot go back and ask. Counts and flags only — never a value.
 */
export function ingestNote(r: IngestResult): string {
  return (
    r.detail ??
    [
      `rows=${r.rows}`,
      `swept=${r.swept}`,
      r.complete === undefined ? null : `complete=${r.complete}`,
      r.skipped ? `skipped=${r.skipped}` : null,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * A scope losing EVERY one of its rows at once is an access change, not a cleanup.
 *
 * `meta.owner` on drive, `meta.mailbox` on gmail, `meta.database` on notion: each names
 * where a row came from. Documents do not all get deleted on the same day, so a scope
 * emptying completely means the walk stopped being able to SEE it — a permission
 * revoked, a share removed, a credential swapped.
 *
 * The majority guard below does not cover this. Measured 2026-09-06, drive's largest
 * owner holds 48.5% of the source — it would be deleted whole and the guard would miss
 * it by 1.5 points. And this is not hypothetical: production Drive once listed 24
 * documents where a laptop listed 512, and only the majority guard stopped each run
 * removing the other ~11,000 chunks. At 48% it would not have.
 *
 * Two conditions, because scopes legitimately empty. A one-off file gets unshared and
 * its single row should not block every future sweep — so the vanishing scope must hold
 * BOTH at least 5% of the source AND at least 20 rows before it is read as lost access.
 * Rows with no scope are never judged: absence of evidence is not evidence of deletion.
 */
const SCOPE_VANISH_SHARE = 0.05;
const SCOPE_VANISH_MIN_ROWS = 20;

export async function sweepMissing(
  source: string,
  seenIds: Set<string>,
  opts: { scopeKey?: string; walkedScopes?: ReadonlySet<string> } = {}
): Promise<number> {
  const stored: string[] = [];
  /** source_id -> the scope it belongs to, when this source names one. */
  const scopeOf = new Map<string, string>();
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${encodeURIComponent(source)}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep skipped: could not list stored ids");
      return 0;
    }
    const batch = (await res.json().catch(() => null)) as Array<{
      source_id?: string;
      meta?: Record<string, unknown> | null;
    }> | null;
    if (!Array.isArray(batch)) {
      logger.warn({ source }, "brain sweep skipped: unreadable stored-id page");
      return 0;
    }
    for (const r of batch) {
      if (!r?.source_id) continue;
      stored.push(r.source_id);
      const scope = opts.scopeKey ? r.meta?.[opts.scopeKey] : undefined;
      if (typeof scope === "string" && scope) scopeOf.set(r.source_id, scope);
    }
    if (batch.length < 1000) break;
  }
  if (stored.length === 0) return 0;

  /**
   * A row from a scope this run DID NOT WALK is history, not an orphan.
   *
   * The vanishing-scope heuristic below is the second line of defence and only
   * the second: it needs a scope to lose every row it holds AND to clear both a
   * 20-row floor and a 5% share, which is deliberate (see brain-sweep-scope
   * tests) and by design lets small scopes through. Gmail therefore carries the
   * strong rule in its own keep-set, and drive and notion never got it — so
   * every drive owner under 5% of the source and thirty of notion's
   * thirty-three databases could be deleted whole the day their access
   * changed. Measured 2026-09-17: 11 of 15 drive owners (775 rows, including
   * every external collaborator) and 30 of 33 notion databases sat under that
   * bar.
   *
   * Rows from scopes that WERE walked still sweep, which is what keeps the
   * stale-version cleanup working.
   *
   * A row with NO readable scope keeps today's behaviour and stays sweepable.
   * Gmail treats unattributable rows as history, but it does that in its own
   * keep-set and its unscoped set is tiny; here the same rule would make 348 of
   * notion's 1,484 rows immortal, because a standalone page carries no database
   * and is walked on every run. So this guard only protects what it can prove is
   * at risk — a scope that exists and was not walked — and leaves the rest
   * exactly as it was, which is why it cannot regress any current behaviour.
   * The residual gap is an unscoped row whose source silently stops listing it.
   */
  const missing = stored.filter((id) => !seenIds.has(id));
  const walked = opts.walkedScopes;
  const orphans = walked
    ? missing.filter((id) => {
        const sc = scopeOf.get(id);
        return sc === undefined || walked.has(sc);
      })
    : missing;
  if (walked && orphans.length < missing.length) {
    logger.info(
      { source, kept: missing.length - orphans.length, scopes: walked.size },
      "brain sweep: kept rows from scopes this run did not walk"
    );
  }

  if (opts.scopeKey && orphans.length > 0) {
    const held = new Map<string, number>();
    for (const id of stored) {
      const sc = scopeOf.get(id);
      if (sc) held.set(sc, (held.get(sc) ?? 0) + 1);
    }
    const losing = new Map<string, number>();
    for (const id of orphans) {
      const sc = scopeOf.get(id);
      if (sc) losing.set(sc, (losing.get(sc) ?? 0) + 1);
    }
    const vanishing = [...losing.entries()].filter(
      ([sc, n]) =>
        n === held.get(sc) && n >= SCOPE_VANISH_MIN_ROWS && n >= stored.length * SCOPE_VANISH_SHARE
    );
    if (vanishing.length > 0) {
      logger.warn(
        {
          source,
          scopeKey: opts.scopeKey,
          vanishing: vanishing.map(([sc, n]) => `${sc}=${n}`),
          stored: stored.length,
        },
        "brain sweep skipped: an entire scope would disappear at once, which is lost access rather than deleted documents"
      );
      return 0;
    }
  }
  if (orphans.length === 0) return 0;
  if (orphans.length > stored.length - orphans.length) {
    logger.warn(
      { source, orphans: orphans.length, stored: stored.length },
      "brain sweep skipped: it would delete the majority of this source, which is either a mass id change or a broken collection"
    );
    return 0;
  }

  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const list = orphans
      .slice(i, i + 100)
      .map((id) => `"${id.replace(/"/g, '""')}"`)
      .join(",");
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}` +
        `&source_id=in.(${encodeURIComponent(list)})`,
      { method: "DELETE", headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) {
      // Stop rather than continue: a partial failure mid-sweep is not a reason to
      // keep deleting, and whatever is left is swept on the next attempt.
      logger.warn({ source, status: res.status }, "brain sweep failed partway");
      return deleted;
    }
    const gone = (await res.json().catch(() => [])) as unknown[];
    deleted += Array.isArray(gone) ? gone.length : 0;
  }
  return deleted;
}

/**
 * Build the PostgREST predicate that confines a sweep to the scopes a run
 * walked. Verified against the live API: `meta->>channel=in.("hr","payments")`
 * returns exactly those channels' rows.
 */
function scopeFilter(scopeKey: string, walked: ReadonlySet<string>): string {
  const list = [...walked].map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
  return `&meta->>${encodeURIComponent(scopeKey)}=in.(${encodeURIComponent(list)})`;
}

export async function sweepStale(
  source: string,
  stampedAt: string,
  wroteRows: number,
  opts: { scopeKey?: string; walkedScopes?: ReadonlySet<string> } = {}
): Promise<number> {
  /**
   * Confine the whole sweep — counts AND delete — to the scopes this run
   * walked.
   *
   * `sweepStale` deletes everything older than the run stamp, so a scope that
   * stops being walked goes stale and is removed. Slack re-touches every row
   * every run (all 562 carry the same `updated_at`), which means leaving a
   * channel deletes it: 9 of its 10 channels sit under the majority guard, the
   * only thing that was protecting them. Same failure as the Gmail mailbox
   * sweep, reached through a timestamp instead of an id set.
   *
   * The counts take the same predicate as the DELETE on purpose. Filtering only
   * the delete would leave the majority guard comparing a scoped deletion
   * against an unscoped total, which reads as "a small minority" and waves
   * through exactly the case it exists to refuse.
   */
  const scoped =
    opts.scopeKey && opts.walkedScopes && opts.walkedScopes.size > 0
      ? scopeFilter(opts.scopeKey, opts.walkedScopes)
      : "";

  if (wroteRows <= 0) {
    logger.warn(
      { source },
      "brain sweep skipped: run wrote no rows, refusing to delete the source"
    );
    return 0;
  }

  // HOW MANY ROWS WOULD THIS DELETE, asked with the DELETE's own predicate.
  //
  // A `wroteRows > 0` check closes only the empty case, and the partial case is
  // both likelier and nearly as damaging: a GA4 report truncated to 5 of 90 days
  // writes 5 chunks, clears the zero check, and the sweep removes the other 85.
  const wouldDelete = await countChunks(source, stampedAt, scoped);
  const total = await countChunks(source, null, scoped);
  if (wouldDelete === null || total === null) {
    logger.warn(
      { source },
      "brain sweep skipped: could not count existing rows, refusing to delete"
    );
    return 0;
  }
  if (wouldDelete === 0) return 0;

  // Counts cannot distinguish a legitimate mass id change (a shorter `DAYS`
  // window, a re-chunking) from a broken collection — both leave most rows
  // orphaned. Refuse and say so: stale rows are recoverable, deleted rows are
  // not. The cron surfaces this as a zero-row/skip alert.
  if (wouldDelete > total - wouldDelete) {
    logger.warn(
      { source, wouldDelete, keeps: total - wouldDelete, wroteRows },
      "brain sweep skipped: it would delete the majority of this source, which is either a mass id change or a broken collection"
    );
    return 0;
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}&updated_at=lt.${encodeURIComponent(stampedAt)}${scoped}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep failed");
      return 0;
    }
    const deleted = (await res.json().catch(() => [])) as unknown[];
    return Array.isArray(deleted) ? deleted.length : 0;
  } catch (err) {
    logger.warn({ err, source }, "brain sweep threw");
    return 0;
  }
}

/**
 * Rows for a source, optionally only those older than `before` — the same
 * predicate the DELETE uses, so after an upsert it counts precisely the orphans.
 *
 * Returns NULL on any failure, never 0. The previous version returned 0, and the
 * caller read 0 as "nothing stored, nothing to protect" and swept. A 503, a
 * missing `Content-Range`, or PostgREST answering `0-0/*` therefore turned the
 * safety check into a no-op — measured on the repo ingester, 1,448 rows deleted
 * with no warning and a healthy-looking exit 0. A failed DELETE is fatal here; a
 * failed safety check must not be "proceed".
 */
async function countChunks(
  source: string,
  before: string | null,
  extra = ""
): Promise<number | null> {
  const filter = before ? `&updated_at=lt.${encodeURIComponent(before)}` : "";
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id&source=eq.${encodeURIComponent(source)}${filter}${extra}`,
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    );
    if (!res.ok) return null;
    const raw = res.headers.get("content-range")?.split("/")[1];
    if (!raw || raw === "*") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface IngestResult {
  source: string;
  rows: number;
  swept: number;
  skipped?: string;
  error?: string;
  /**
   * false when the walk did not see everything it meant to — a listing page cap, an
   * export that failed, or the time budget running out mid-fetch.
   *
   * Deliberately NOT a `skipped`, because a partial walk still indexed real work and
   * `skipped` alerts. It exists so the two cases are distinguishable at all: drive
   * computed this flag, logged it, and then dropped it from the result, so a run that
   * fetched one of three documents returned a byte-identical object to a complete one
   * and `cron_run` recorded success for both.
   */
  complete?: boolean;
  /**
   * True when THIS run could not sweep because it did not see the whole source.
   *
   * Deliberately separate from `complete`, because they are not the same question and
   * conflating them produced a false alarm within a day of shipping one. `complete` is
   * "did the walk index everything it meant to"; this is "would deleting anything the
   * walk did not see be safe". Drive gates its sweep on the LISTING alone -- a failed
   * export leaves the document listed, so it never looks deleted -- while gmail and
   * calendar gate on the whole walk. Measured 2026-09-07: drive reported
   * `complete=false stopped=export-failed` on every run while sweeping normally, so an
   * alert keyed on `complete` told people deletions were broken when they were not.
   *
   * Undefined means the source does not distinguish the two; callers fall back to
   * `complete === false`.
   */
  sweepBlocked?: boolean;
  /**
   * One line of WHY, for `cron_run.error_message`.
   *
   * Same channel `google-oauth.ts` already uses, and for the same reason: Vercel's
   * log query times out, so a diagnosis that only ever reaches the logs is a
   * diagnosis nobody reads. Recorded whatever the status, so a run that is skipping
   * on purpose still says what it saw. Never a secret — counts and flags only.
   */
  detail?: string;
}
