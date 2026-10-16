import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  DIRECTORY_SCOPE,
  getDelegatedToken,
  getGoogleAccessToken,
  googleCredentialShape,
  GMAIL_SCOPE,
} from "@shared/http/google-oauth";
import { decodeEntities } from "@shared/format/html-escape";
import logger from "@shared/observability/logger";
import { loadPeople } from "@features/brain/server/people";
import { splitBody } from "./notion";
import {
  isJobApplication,
  isLegalInstrument,
  chunkPage,
  dayOfMoment,
  momentOf,
  recordSweep,
  shouldSweep,
  sweepMissing,
  upsertChunks,
  type BrainRow,
  type IngestResult,
} from "./upsert";

/**
 * Company email.
 *
 * Where a startup's decisions and relationships actually live: investor threads,
 * customer replies, the supplier who said yes, the thing agreed at 11pm that never
 * reached Notion. The repo has the result, Slack has the argument, and email has
 * everything said to the outside world.
 *
 * ONE CHUNK PER THREAD, not per message — the same reasoning as Slack days. A reply
 * saying "yes, agreed, let's do the 39.99" is meaningless without the message above
 * it, and a thread is the unit somebody actually asks about.
 *
 * CUSTOMER MAIL IS IN, DELIBERATELY, AND THAT IS NOT A CONTRADICTION OF THE SLACK
 * DENYLIST. Decided 2026-09-18, after an audit noticed the two look alike and asked.
 *
 * `#email-inbox` is denylisted in `slack.ts` because that channel was created to
 * forward the company address into Slack and was restricted to three people ON
 * PURPOSE — indexing it would have handed an undifferentiated corpus something its
 * owner had deliberately fenced off. A shared mailbox the team already reads is not
 * that: nobody fenced it, and the threads in it are where real answers live.
 * Measured the same day: 69 chunks from `hello@`, 188 from `teamwork@`, including
 * contract disputes and cancellations — which is exactly the material somebody asking
 * "what do customers complain about" needs.
 *
 * So the boundary is the ACCESS RESTRICTION somebody set, not the word "customer".
 * If a mailbox is ever locked down the way that channel was, it belongs on a denylist
 * here, and this comment is the reason why.
 */

const SOURCE = "gmail";
const API = "https://gmail.googleapis.com/gmail/v1/users";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
/**
 * 40 x 100 = 4,000 threads per mailbox. At 20 the first real walk stopped at
 * exactly 2,000 and reported `gmail-walk-incomplete`, which is honest but means
 * the oldest mail is never reached. ec@loveiq.org holds 2,650 threads before
 * filtering.
 */
const MAX_PAGES = 40;

/**
 * A SINGLE-message thread this short is a notification stub, not a conversation.
 *
 * Measured: the "Your secure link to Claude.ai is here" mails reduce to a body of
 * "96" and whitespace — the link lives in HTML that the plain part does not carry,
 * so nothing useful survives (and nothing sensitive is stored either: verified zero
 * URLs in the indexed body). Dozens of those crowd the corpus while being unable to
 * answer anything.
 *
 * The single-message condition is load-bearing. A first attempt tested the whole
 * thread's length and threw away a genuine two-line exchange — "Should we go to
 * 39.99?" / "Yes." — which is short, decisive, and exactly the kind of thing the
 * brain exists to remember. A reply means a human engaged; length is only evidence
 * when nobody did.
 */
const MIN_STUB_CHARS = 60;
/**
 * How many individual thread fetches may fail before the whole walk is called
 * incomplete.
 *
 * One flaky thread out of ~3,900 used to mark the entire walk incomplete, which
 * blocks the sweep — so `brain-gmail` had never once completed and deleted threads
 * lingered forever. A 404 on a single thread is normal: it can be deleted between
 * the listing and the fetch. A systemic failure is different in KIND, and shows up
 * as many failures, not one.
 */
const MAX_TOLERATED_THREAD_FAILURES = 25;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
// v2: v1 indexed notification stubs (bodies of "96" and whitespace) as threads.
// v7: v1-v6 read every message BODY and no attachment, so a proposal sent as a pdf
// or a spec as a docx was invisible while the thread around it read as complete.
// Without the bump this reaches only threads that happen to change: a thread is
// refetched on a historyId move, and an old thread's history never moves again.
// v8: attachments that are signed legal instruments are no longer read. Same reason
// the bump was needed for v7 and in the other direction — an old thread's history
// never moves, so without this the contract already indexed would stay indexed.
// v9: message and attachment text is tidied before chunking — zero-width preheader
// padding, non-breaking spaces, CRLF and runs of blank lines removed. Measured
// 2026-09-23: 3,007 of 9,194 chunks were more than half whitespace and zero-width
// characters, 36.5% of all Gmail text against ~15% for ordinary prose, so a chunk held
// half its content and a search result spent its budget on blank space. A bump because
// an unchanged thread is never re-read, so nothing already stored would be re-rendered.
export const GMAIL_BUILDER_VERSION = 9;

/**
 * Mailboxes to read. `me` is whoever the credential belongs to.
 *
 * Reading a COLLEAGUE's mailbox needs Workspace domain-wide delegation — a user
 * OAuth token only ever reaches its own mail, whatever scope it carries. Listing
 * them here rather than hardcoding `me` means turning that on later is config, not
 * a rewrite.
 */
export function mailboxes(): string[] {
  const configured = (process.env.GMAIL_MAILBOXES ?? "").trim();
  if (!configured) return ["me"];
  return configured
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Mailboxes to leave out, whatever the directory says.
 *
 * The directory drops a person when their account is SUSPENDED, which is the right
 * default but not the only case: a colleague can leave with their account still live
 * during handover, and their mail can simply not be wanted in the corpus. This is the
 * switch for that, and it is deliberately an ENV VAR rather than a constant — the
 * repository is public, and a list of named individuals whose mail the company chose
 * not to read does not belong in it. It also means the decision can be changed without
 * a deploy.
 *
 * Excluding a mailbox does NOT remove what is already indexed. `sweepMissing` keeps
 * rows from any mailbox this run did not walk — see the keep-set in `ingestGmail` — so
 * an excluded mailbox's history is preserved rather than quietly deleted. Removing it
 * is a separate, deliberate act.
 */
export function excludeMailboxes(boxes: string[]): string[] {
  const raw = (process.env.GMAIL_EXCLUDE_MAILBOXES ?? "").trim();
  if (!raw) return boxes;
  const drop = new Set(
    raw
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean)
  );
  const kept = boxes.filter((m) => !drop.has(m.trim().toLowerCase()));
  if (kept.length !== boxes.length) {
    logger.info(
      { excluded: boxes.length - kept.length, walking: kept.length },
      "brain-ingest gmail: mailboxes excluded by configuration"
    );
  }
  return kept;
}

/**
 * Every active person in the Workspace domain, asked of the directory itself.
 *
 * Preferred over a hand-maintained `GMAIL_MAILBOXES` list because that list goes
 * stale the moment somebody joins or leaves — silently, since a missing mailbox
 * looks exactly like a quiet one. Suspended and archived accounts are excluded by
 * the query; a departed colleague's mail stays in the corpus as history but stops
 * being re-read.
 *
 * Needs `admin.directory.user.readonly` on the SAME domain-wide delegation grant,
 * and an admin `subject` to ask as — the directory refuses an ordinary user.
 * Returns null when unavailable, which the caller reads as "fall back to the
 * configured list" rather than "the company has no staff".
 */
export async function domainMailboxes(oidcToken?: string | null): Promise<string[] | null> {
  const admin = (process.env.GOOGLE_WORKSPACE_ADMIN ?? "").trim();
  const domain = (process.env.GOOGLE_WORKSPACE_DOMAIN ?? "").trim();
  /**
   * BOTH of these used to return null in silence, which is why a real outage was
   * invisible: the caller falls back to a single mailbox, that mailbox belongs to
   * a service account with no Gmail, and the API answers 400 "Precondition check
   * failed" — three steps away from the actual cause. Only the directory LISTING
   * refusal logged, and that is the one case that was not happening.
   */
  if (!admin || !domain) {
    logger.warn(
      { hasAdmin: Boolean(admin), hasDomain: Boolean(domain) },
      "brain-ingest gmail: workspace admin/domain not configured, so only one mailbox is reachable"
    );
    return null;
  }

  const token = await getDelegatedToken(admin, DIRECTORY_SCOPE, Date.now(), oidcToken);
  if (!token) {
    logger.warn(
      { admin, credential: googleCredentialShape(oidcToken) },
      "brain-ingest gmail: could not mint a delegated token for the workspace admin — " +
        "domain-wide delegation is not working, so no colleague's mail is reachable"
    );
    return null;
  }

  const out: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const res = await fetchWithTimeout(
      "https://admin.googleapis.com/admin/directory/v1/users" +
        `?domain=${encodeURIComponent(domain)}&maxResults=200&query=isSuspended=false` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      { headers: { Authorization: `Bearer ${token}` }, timeoutMs: TIMEOUT_MS }
    );
    if (!res.ok) {
      logger.warn(
        { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 200) },
        "brain-ingest gmail: directory listing refused"
      );
      return out.length > 0 ? out : null;
    }
    const json = (await res.json().catch(() => ({}))) as {
      users?: Array<{ primaryEmail?: string; archived?: boolean; suspended?: boolean }>;
      nextPageToken?: string;
    };
    for (const u of json.users ?? []) {
      if (u.primaryEmail && !u.archived && !u.suspended) out.push(u.primaryEmail);
    }
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

/**
 * What NOT to index, as a Gmail search query.
 *
 * Promotions, social and forums are Google's own noise buckets and are almost
 * entirely newsletters and marketing. Spam and trash are self-explanatory. Chats is
 * Google Chat history, which is not email.
 *
 * Deliberately NOT excluded: automated mail from Stripe, Vercel and the like. A
 * payment receipt or a failed-deploy notice is real company history, and the team
 * frequently replies to those threads — which is exactly the content that would be
 * lost by filtering on sender.
 */
const EXCLUDE =
  "-in:spam -in:trash -in:chats -category:promotions -category:social -category:forums";
/**
 * The hiring inbox keeps Google's noise buckets: a job board or LinkedIn can send an
 * application that Gmail files under Social or Promotions, where it would be skipped
 * without a trace. None was there on 2026-10-13: all 35 threads passed the filter above.
 */
const EXCLUDE_HIRING = "-in:spam -in:trash -in:chats";

/**
 * RECRUITING MAIL, kept out at the LISTING (owner's decision, 2026-09-23).
 *
 * Applications, CVs, interview invitations and candidate follow-ups hold named
 * applicants' personal data. Measured 2026-09-23: 85 such threads across the walked
 * mailboxes, and every subject carrying "interview" was a hiring interview — none was
 * press. At the listing rather than after the fetch because a thread refused after
 * fetching is fetched again on every run; excluded here it costs nothing.
 *
 * The cost is deliberate and recorded: a future non-hiring subject with one of these
 * words — a grant "application", say — would be excluded too. Words, not ids, because
 * recruiting keeps happening. Generic vocabulary, so it can live in the public repo,
 * unlike the environment-configured terms above.
 */
export const RECRUITING_SUBJECT_TERMS = [
  "application",
  "applications",
  "apication", // sic — a real subject line, typo and all
  "applicant",
  "applicants",
  "internship",
  "interview",
  "cv",
  "candidate",
  "bewerbung",
  "design intern follow up",
];
/**
 * CONTRACT TEXT ARRIVING AS MAIL. The legal-instrument rule keeps the shareholders'
 * agreement and individual contracts out of Drive and out of attachments by name; the
 * same text also arrives as email bodies — a clause-by-clause critique of the SHA draft,
 * Docs comment notifications quoting it word for word, freelance contract and
 * salary-and-contract emails setting out a named person's terms. Same documents, a
 * fourth path. Measured 2026-09-23: these terms select exactly those threads plus the
 * sharing notifications for the agreement, and no meeting notes: a meeting ABOUT a
 * contract stays, as it does in Drive, because compensation discussion is inside the
 * open-access decision and the instrument is not.
 */
export const CONTRACT_SUBJECT_TERMS = [
  "sha",
  "shareholders",
  "gesellschaftervertrag",
  "freelance contract",
  "salary contract",
];

/**
 * Every standing listing exclusion, as Gmail `-subject:` terms. The hiring inbox keeps its
 * application subjects (see HIRING_MAILBOXES); contracts are excluded everywhere.
 */
export function standingExclusionsQuery(hiring = false): string {
  return [...(hiring ? [] : RECRUITING_SUBJECT_TERMS), ...CONTRACT_SUBJECT_TERMS]
    .map((t) => (t.includes(" ") ? ` -subject:"${t}"` : ` -subject:${t}`))
    .join("");
}

/**
 * The backstop, for recruiting mail whose SUBJECT says nothing: five of the six
 * "Follow-up :)" threads carry a candidate's application task in the body, and the sixth
 * — an Academic Board letter — shares the subject exactly. Only the body separates them.
 *
 * Widened the same day, after the cleanup query found what the first version missed: two
 * candidate follow-ups that name the task after the role ("Growth Lead Task") under "we
 * are looking to fill a long-term position", and offer and contract emails that set out a
 * named person's pay for a probation period. Measured across every indexed thread, the
 * two added phrases select exactly six, all of them one of those.
 *
 * And again after asking the brain directly, the only test that counts: three
 * applications still came back — a CV forwarded from hr@ under "MSc in Psychology –
 * Research Opportunities", an application under "LinkedIn job - product position", and
 * the emailed Gemini recap of a candidate call whose Drive copy was already refused. An
 * applicant's own words ("attached my CV", "decided to apply") and the recap's
 * "recruitment assessment" select exactly those four threads across all mail.
 *
 * No trailing word boundary: in a JavaScript regex without the u flag "é" is not a word
 * character, so `résumé\b` can never match "résumé " and the clause would be dead.
 *
 * The probation clause is held apart because it is not about applicants: it is a named
 * person's pay, which stays out of the hiring inbox too (see HIRING_MAILBOXES).
 */
const RECRUITING_BODY =
  /\b(application ta(sk|ks)|applicant task|candidate task|fill a (long-term |full-time |part-time )?(position|role)|attached (is )?my (cv|resume|résumé)|my (cv|resume|résumé) (is )?attached|(see|find) (on|in) my (cv|resume|résumé)|decided to apply|recruitment assessment)/i;
const PAY_TERMS_BODY = /\bprobation(ary)? (time|period)/i;
export function isPayTermsThread(subject: string, text: string): boolean {
  return PAY_TERMS_BODY.test(subject) || PAY_TERMS_BODY.test(text);
}
export function isRecruitingThread(subject: string, text: string): boolean {
  return (
    RECRUITING_BODY.test(subject) || RECRUITING_BODY.test(text) || isPayTermsThread(subject, text)
  );
}

/**
 * A TRUSTPILOT REVIEW, titled as what it is.
 *
 * Every review notification arrives with the same subject — "You've got a new 5-star
 * review" — and `brain_search` collapses Gmail rows that share a title, so three of the
 * four reviews could never be returned by any search, including one that said
 * "Trustpilot". The title now carries the stars, the date and the review's opening words,
 * so each is its own document and matches how people ask. The reviewer's name stays in
 * the body only.
 *
 * AND LABELLED, because findable is not the same as honest. On 2026-09-18 the team said
 * in its WhatsApp group that the reviews so far came from friends. Reviews received up to
 * that day are marked so, on the title that every search result shows, so a question
 * about what customers think is not answered with friends' praise. Later reviews carry no
 * such mark; whether they are customers is for whoever reads them to judge.
 */
const TRUSTPILOT_REVIEW =
  /left a new (\d)-star review of [^:]{1,60}:\s*([\s\S]{1,600}?)\s*See this review/i;
const FRIENDS_REVIEWS_UNTIL = "2026-09-18";
export function trustpilotReviewTitle(
  subject: string,
  text: string,
  day: string | null
): string | null {
  if (!/\bnew \d-star review\b/i.test(subject)) return null;
  const m = TRUSTPILOT_REVIEW.exec(text);
  if (!m) return null;
  const opening = m[2]!.replace(/\s+/g, " ").trim();
  const firstSentence = (
    opening.match(/^.{1,90}?[.!?](?=\s|$)/)?.[0] ?? opening.slice(0, 90)
  ).trim();
  const early = day !== null && day <= FRIENDS_REVIEWS_UNTIL;
  return (
    `Trustpilot review of LoveIQ, ${m[1]} stars${day ? `, ${day}` : ""}: "${firstSentence}"` +
    (early
      ? " [one of the first reviews, which the team says came from friends, not customers]"
      : "")
  );
}

/**
 * Mailboxes that are never company knowledge. Unlike `GMAIL_EXCLUDE_MAILBOXES` — which
 * stops reading a mailbox but keeps its history — a mailbox here is also removed from the
 * corpus.
 *
 * `hello@` is the address customers write to. The line this system does not move
 * (CLAUDE.md, "Who can see what"; the `#email-inbox` note in slack.ts) is that what a
 * customer writes to us privately is not indexed — and `#email-inbox` was excluded on
 * 2026-09-14 precisely because it forwards this address, while the mailbox itself went on
 * being walked. Measured 2026-09-23: cancellations and revocations, a contract dispute
 * naming a minor, a debt claim, feedback, replies to report emails, contact-form
 * submissions, and vendor cold pitches — nothing a teammate needs from the brain.
 *
 * `hr@` was here from 2026-09-23 to 2026-10-13; it is the hiring inbox now, below.
 */
export const NEVER_INDEX_MAILBOXES = new Set(["hello@loveiq.org"]);

/**
 * THE HIRING INBOX, READ IN FULL (owner's decision, 2026-10-13): applications come to
 * `hr@`, and the team reviews them through Jarvis, in claude.ai and in Claude Code.
 *
 * So here, and only here, the recruiting rules do not apply: application subjects are
 * listed, application bodies are kept, and CVs, cover letters and task submissions are
 * read whatever they are called, up to Gmail's own attachment limit. Measured 2026-10-13:
 * 35 threads, 29 of them applications, which those rules left at 6 indexable threads with
 * no CV among them. An application is often a CV with a line of text or none, so no thread
 * here is a stub. Each title carries the applicant's name, because search keeps one Gmail
 * result per title and applicants share subjects ("Application for Chief of Staff
 * Internship").
 *
 * Still out: contracts and offers, by subject (CONTRACT_SUBJECT_TERMS; two signed
 * freelance agreements sit in this inbox), by file name in the team's three languages
 * (HIRING_INSTRUMENT) and by what a file says (AGREEMENT_TEXT), and a message of ours that
 * states pay (isPayMessage). Elsewhere the recruiting rules stand, so an application
 * forwarded into a colleague's mailbox is not indexed a second time.
 */
export const HIRING_MAILBOXES = new Set(["hr@loveiq.org"]);
export const isHiringMailbox = (mailbox: string): boolean =>
  HIRING_MAILBOXES.has(mailbox.trim().toLowerCase());
/**
 * The hiring inboxes as a PostgREST list, `("hr@loveiq.org")`, for the readers that must
 * leave applicants out: the daily brief posts the titles it reads to Slack and keeps them
 * in a notice, which would outlive the mailbox, and comment asks are a person's.
 */
export const HIRING_MAILBOX_LIST = `(${[...HIRING_MAILBOXES].map((m) => `"${m}"`).join(",")})`;

/**
 * THE HIRING INBOX'S COPIES, left out of colleagues' mailboxes. Since 2026-10-13 hr@
 * forwards what it receives to part of the team, by Gmail's own forwarding, so each
 * application arrived four more times, carrying `Delivered-To: hr@loveiq.org`. Any whose
 * subject the recruiting terms miss ("Design_intern") was indexed again: 11 copies in one
 * evening, without their files and without the applicant's name. hr@ holds the original.
 * Gmail lists a thread when any message in it matches, so a thread where a colleague
 * replied is still listed and judged by the usual rules; only pure copies are left out,
 * and the copies already stored leave with the next sweep.
 */
export const notHiringCopies = (): string =>
  [...HIRING_MAILBOXES].map((m) => ` -deliveredto:${m}`).join("");

/**
 * Subjects to keep out of the corpus entirely, as Gmail `-subject:` terms.
 *
 * The company runs more than one product, and a sibling project's issue tracker
 * mails this workspace all day. Measured 2026-09-06 on twelve ordinary LoveIQ
 * questions: that project's tickets took rank 1 on four of them and the ENTIRE
 * top three on "what analytics and tracking do we have" and "what is the status
 * of the backend work" -- generic engineering wording matches a ticket queue far
 * better than it matches a decision. The tickets are real work, just not this
 * product's, and the brain is asked about this product.
 *
 * Applied at the LISTING, not at row-building, and that placement is the whole
 * point: `seen` is filled from the listing, and `sweepMissing` keeps anything in
 * `seen`. A thread filtered later would still be protected and its old rows would
 * live forever. Filtered here it is never listed, so the sweep removes what is
 * already stored with no separate deletion step.
 *
 * An ENV VAR rather than a constant, for the same reason as
 * `GMAIL_EXCLUDE_MAILBOXES`: the repository is public and another team's project
 * codename does not belong in it, and the decision can be reversed without a
 * deploy. Verified before enabling: of 1,308 indexed chunks whose subject carried
 * the excluded term, 1,308 were issue-tracker notifications and none was human
 * mail, so this costs no conversation.
 */
export function excludeSubjects(): string {
  const raw = (process.env.GMAIL_EXCLUDE_SUBJECTS ?? "").trim();
  if (!raw) return "";
  const terms = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    // Gmail treats these as operators inside a term; a stray one silently changes
    // the query's meaning rather than failing, so they are dropped.
    .filter((t) => !/[():{}"\s]/.test(t));
  return terms.map((t) => ` -subject:${t}`).join("");
}

interface GmailHeader {
  name?: string;
  value?: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: GmailHeader[] };
}
interface GmailThread {
  id?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

async function gmailGet(
  token: string,
  mailbox: string,
  path: string
): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(`${API}/${encodeURIComponent(mailbox)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // A missing scope is configuration, not an outage, and naming it turns a dead
    // end into a one-line fix.
    logger.warn(
      { path, status: res.status, detail: body.slice(0, 200) },
      "brain-ingest gmail: api refused"
    );
    return null;
  }
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

const header = (m: GmailMessage, name: string): string =>
  (m.payload?.headers ?? []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Gmail encodes bodies as base64url, and omits padding. */
function decode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

/**
 * Plain text out of a MIME tree.
 *
 * Prefers `text/plain`; falls back to stripping tags from `text/html`, because a
 * good share of real mail — anything sent from a phone or a marketing tool — has no
 * plain part at all, and skipping those would silently lose whole conversations.
 */
export function messageText(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);

  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const t = messageText(p);
      if (t.trim()) return t;
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeEntities(
      decode(part.body.data)
        // <head> before <style>: a marketing email's stylesheet is often inside a
        // conditional comment or left unclosed by a truncated part, and then the
        // <style> rule below cannot match it. Measured 2026-09-19: 115 gmail chunks
        // held CSS like `line-height: 2em; color:#000; }` as if it were prose.
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
  }
  return "";
}

/**
 * Strip the quoted copy of the previous message.
 *
 * Without this every reply carries the whole thread beneath it, so a ten-message
 * thread is stored ten times over — the body limit then truncates the actual new
 * text in favour of quoted history, and search matches the same sentence in ten
 * chunks.
 */
export function stripQuoted(text: string): string {
  const cut = text.search(
    /\n\s*(On .{0,120}wrote:|-{2,} ?Original Message ?-{2,}|_{10,}|From: .{0,120}\n(Sent|To):)/
  );
  const body = cut > 0 ? text.slice(0, cut) : text;
  return body
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Is this thread BULK MAIL rather than a conversation?
 *
 * `List-Unsubscribe` is the honest signal: RFC 2369 requires it on mail sent to a
 * list, and no human replying from a mail client emits it. Everything else we could
 * reach for is a guess about wording or sender names.
 *
 * `every`, not `some`, and that is the whole subtlety: a newsletter that somebody
 * FORWARDED and the team then argued about is a real conversation, and the replies
 * carry no such header. Requiring it on every message lets those threads back out
 * of the penalty box, while a plain untouched newsletter -- always a single message
 * -- still matches.
 *
 * Rejected alternative, measured: "did anyone reply" (`messages > 1`). JIRA
 * notification threads accumulate messages, so it promoted ticket spam above the
 * actual commits.
 */
/**
 * One message that no person typed.
 *
 * `List-Unsubscribe` alone caught marketing and missed the larger half. Measured
 * 2026-09-06: 2,694 indexed chunks -- 29% of all mail, 11% of the whole corpus --
 * were machine-generated notifications (issue trackers, failed deploys, security
 * alerts) carrying NO demotion at all, against 47 that the header caught. Bulk
 * senders subscribe to RFC 2369 because they must; a notification robot does not
 * have to and mostly does not.
 *
 * RFC 3834 is the standard the robots do follow: `Auto-Submitted` on anything a
 * program generated, with `no` reserved for mail a human actually sent. The older
 * `Precedence: bulk` is the pre-RFC spelling of the same claim and still common.
 */
const machineSent = (m: GmailMessage): boolean =>
  header(m, "List-Unsubscribe") !== "" ||
  // "no" means a person sent it, so anything else -- auto-generated,
  // auto-replied, auto-notified -- is the robot saying so itself.
  (header(m, "Auto-Submitted") !== "" && !/^no$/i.test(header(m, "Auto-Submitted").trim())) ||
  /^(bulk|auto_reply|list|junk)$/i.test(header(m, "Precedence").trim());

export function isBulkMail(msgs: GmailMessage[]): boolean {
  return msgs.length > 0 && msgs.every(machineSent);
}

/** An address only a machine sends from, whatever its headers say. */
const MACHINE_SENDER =
  /(^|[\s<"])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|alerts?|security|verify|verification)@/i;
const fromAPerson = (m: GmailMessage): boolean =>
  !machineSent(m) && !MACHINE_SENDER.test(header(m, "From"));

/**
 * The DOMAIN an address belongs to, lowercased: `"Marcus <m@loveiq.org>"` -> `loveiq.org`.
 *
 * The domain and never the address, because this repository is public and `meta` is
 * returned verbatim by every search. A domain answers the only question being asked --
 * did this come from inside the company -- and carries nobody's identity.
 */
export function senderDomain(addr: string): string | null {
  const at = /<?([^\s<>@"]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/.exec(addr);
  return at?.[2] ? at[2].toLowerCase() : null;
}

/**
 * Domains that are US — a fast path, not the whole rule.
 *
 * `gmail.com` is deliberately NOT here: it is where most inbound vendor and candidate
 * mail arrives. But two colleagues write from personal gmail addresses
 * (`brain_person` records them), so the domain alone gets them exactly backwards —
 * measured 2026-09-11, a colleague's mail about pricing was classified as a vendor
 * broadcast. The registry below is what actually decides; this only saves a lookup.
 */
const OUR_DOMAINS = new Set(["loveiq.org", "loveiq.com", "markoldenburg.com"]);

/**
 * Was this message written by someone on the team?
 *
 * The people registry is the authority, because it is the only thing that knows a
 * colleague's personal address. It holds twelve rows -- the team, not everyone we have
 * ever corresponded with -- so "the sender is in it" really does mean "one of us".
 * Bots and shared mailboxes are excluded by `kind` in `peopleIn`'s loader; a shared
 * mailbox writing to us is still us, so it counts here.
 *
 * Matched on the ADDRESS and on the display name, because Gmail supplies whichever the
 * sender configured.
 */
function fromTeam(fromHeader: string, byAlias: Map<string, { canonical: string }> | null): boolean {
  const domain = senderDomain(fromHeader);
  if (domain !== null && OUR_DOMAINS.has(domain)) return true;
  if (!byAlias) return false;
  const address = /<?([^\s<>@"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/.exec(fromHeader)?.[1];
  if (address && byAlias.has(address.toLowerCase())) return true;
  const shown = person(fromHeader).toLowerCase();
  return shown.length > 0 && byAlias.has(shown);
}

/** A person, without the angle-bracket noise: "Marcus <m@x.com>" -> "Marcus". */
export function person(addr: string): string {
  const named = /^\s*"?([^"<]+?)"?\s*</.exec(addr);
  if (named?.[1]) return named[1].trim();
  return addr.replace(/[<>]/g, "").trim();
}

/** Long enough for any real name; a display name is the sender's to write, so no more. */
const MAX_NAME_CHARS = 60;

/**
 * Who a hiring thread is about: the first sender from outside the team; failing that the
 * sender of a message a colleague forwarded in; failing that the first outside addressee,
 * for a thread the hiring inbox started itself. The name is the sender's own text, so it is
 * cut to a name's length, and a mail client that writes the address into it ("Jane
 * Doe(jane@uni.edu)") has the address taken out.
 */
function outsider(
  msgs: GmailMessage[],
  byAlias: Map<string, { canonical: string }> | null
): string | null {
  const name = (addr: string): string | null => {
    const n = person(addr)
      .replace(/\s*\([^()]*@[^()]*\)\s*/g, " ")
      .replace(/[\p{Cc}\p{Cf}<>]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    return n ? n.slice(0, MAX_NAME_CHARS).trim() : null;
  };
  for (const m of msgs) {
    const from = header(m, "From");
    if (from && !fromTeam(from, byAlias)) return name(from);
  }
  for (const m of msgs) {
    for (const f of messageText(m.payload).matchAll(/^[>*\s]*From:\*?[ \t]*(.+)$/gim)) {
      if (!fromTeam(f[1]!, byAlias)) return name(f[1]!);
    }
  }
  for (const m of msgs) {
    // Split on commas outside quotes: "Doe, Jane" <j@x.com> is one addressee.
    for (const to of header(m, "To").match(/("[^"]*"|[^,])+/g) ?? []) {
      if (to.trim() && !fromTeam(to, byAlias)) return name(to);
    }
  }
  return null;
}

/**
 * Whether `subject` already names `who`, as a whole word and with or without its accents:
 * "Ana" is not in "Analyst", and "Kristina Krunić" is in "Design Internship Kristina Krunic".
 */
function mentions(subject: string, who: string): boolean {
  const plain = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");
  const word = plain(who).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "iu").test(plain(subject));
}

/**
 * PAY, in the hiring inbox: a pay word and an amount together. Measured on hr@ 2026-10-13:
 * the only amounts outside the two contract threads were grant sums in task submissions,
 * which carry no pay word.
 */
const PAY_WORD =
  /(?<![\p{L}])(probation(ary)?|probezeit|trial period|probni rad|salar(y|ies)|gehalt|lohn|plat[aeu]|plać[aeu]|naknad\p{L}*|honorar\p{L}*|compensation|stipend|remuneration|wages?|per (month|hour)|a month|monthly|hourly|mjese[čc]no|monatlich|brutto|netto|bruto|neto|stundenlohn)(?![\p{L}])/iu;
const MONEY =
  /\d[\d.,]*\s?(€|\$|eur(os?)?|km|bam|usd|chf)(?![\p{L}])|(€|\$)\s?\d|(?<![\p{L}])(eur|usd|bam|km|chf)\s?\d/iu;
export function isPayMessage(text: string): boolean {
  return PAY_WORD.test(text) && MONEY.test(text);
}
export const PAY_LEFT_OUT = "[pay left out of the brain]";

/**
 * PAY, SENTENCE BY SENTENCE, out of the hiring inbox's messages: an offer's salary, a
 * stipend, probation terms with their amount, and the reply that quotes them back (a phone
 * quotes as plain text, not as "> " lines, so `stripQuoted` leaves it). Either side's: a
 * figure an applicant names is a named person's pay too. Each sentence that states pay is
 * replaced and the rest stays, the application included; a message whose pay is spread
 * across sentences is replaced whole, so no message an hr@ row keeps states pay.
 */
export function withoutPay(text: string): string {
  if (!isPayMessage(text)) return text;
  const out = text
    .split(/((?<=[.!?])[ \t]+|\n+)/)
    .map((piece, i) => (i % 2 === 0 && isPayMessage(piece) ? PAY_LEFT_OUT : piece))
    .join("");
  return isPayMessage(out) ? PAY_LEFT_OUT : out;
}

/**
 * ATTACHMENTS ARE CONTENT, and until 2026-09-19 none of them were read.
 *
 * The walk indexed every message BODY and nothing hanging off it, so a proposal
 * sent as a pdf, a spec as a docx or a csv of numbers was invisible — and invisible
 * in the worst way, because the thread around it WAS indexed, so the conversation
 * read as complete while the thing it was about was missing.
 *
 * Deliberately narrow. Only formats there is already a reader for (`unpdf` and
 * `mammoth` are both dependencies for Drive), only files small enough to be prose
 * rather than data, and only a few per thread — a mailbox is not a file store and
 * this must not turn the hourly walk into one.
 */
const ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
/** Past this a file is data, not prose, and the reader is the wrong tool for it. */
export const MAX_ATTACHMENT_BYTES = 4_000_000;
/**
 * Gmail's own attachment limit, for a PDF in the hiring inbox: there a large file is a
 * portfolio or a CV inside one ("CV i portfolio.pdf", 5.3 MB). Measured 2026-10-13: the
 * largest, 18 MB and 24 pages, downloaded in 5.6 s from a laptop and parsed in 0.15 s.
 * PDFs only: a Word file is a zip, which a stranger can make expand to gigabytes in
 * memory, and a CV in Word is never large, so it keeps the 4 MB limit everywhere.
 */
export const MAX_HIRING_ATTACHMENT_BYTES = 25_000_000;
/** And all of one hiring thread's files together: the run budget below still moves a thread. */
export const MAX_HIRING_THREAD_BYTES = 60_000_000;
export const MAX_ATTACHMENTS_PER_THREAD = 5;
/** An application is a CV, a letter, a task and a portfolio, sometimes in two versions. */
export const MAX_HIRING_ATTACHMENTS_PER_THREAD = 10;
/**
 * BOUNDS FOR AN INBOX ANYONE CAN WRITE TO. The hiring inbox reads more per thread than any
 * other, and a stranger decides what arrives there, so a flood of large files must cost one
 * run's share and no more: five files' worth of text a thread (the largest real application
 * held 31,000 characters), and per run 150 MB of downloads (all 35 threads on 2026-10-13
 * came to about 50 MB). The rest waits for the next run, and the hiring inbox is walked
 * last, so colleagues' mail is never what waits.
 */
export const MAX_HIRING_ATTACHMENT_CHARS_PER_THREAD = 100_000;
export const HIRING_RUN_BYTES = 150_000_000;
/** One file's parse, past which it is a hostile or broken file rather than a slow one. */
export const PARSE_TIMEOUT_MS = 20_000;
/** One attachment must not be able to outweigh the conversation that carried it. */
export const MAX_ATTACHMENT_CHARS = 20_000;
/**
 * And five of them must not outweigh the CORPUS.
 *
 * Per-file alone, five 20k attachments is 100,000 characters — 42 chunks for a single
 * thread. Two hundred such threads would add 8,400 chunks to a corpus of 24,694, a
 * third again of everything, all of it attachment text. That is the drowning problem
 * the domain vocabulary caused in miniature, and it costs battery probes when it
 * happens. A thread may contribute ten chunks' worth; past that it is a file store.
 */
export const MAX_ATTACHMENT_CHARS_PER_THREAD = 24_000;

export interface AttachmentRef {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * A CONTRACT OR AN OFFER BY ITS NAME, in the hiring inbox: the legal-instrument rule knows
 * English instruments ("Freelancer Agreement …") but not "Praktikumsvertrag", "Ugovor o
 * radu", "Vereinbarung", "NDA" or an offer letter, the shapes a hire's papers take here.
 * Elsewhere those words are left to that rule, which was measured against every document
 * it touches; in hr@ an applicant's file never carries them.
 */
const HIRING_INSTRUMENT =
  /contract|agreement|vertrag|vereinbarung|ugovor|(?<![\p{L}])nda(?![\p{L}])|offer|angebot|ponud/iu;

/** Files kept out of the corpus by decision, so neither read nor named. */
function keptOut(filename: string, hiring: boolean): boolean {
  if (isLegalInstrument(filename)) return true;
  return hiring ? HIRING_INSTRUMENT.test(filename) : isJobApplication(filename);
}

/**
 * Every readable attachment in a thread. Pure, so the choosing is testable offline.
 *
 * Each file once: a reply or a forward carries the same CV again, and measured 2026-10-13
 * most application threads in the hiring inbox held every file two or three times, each
 * copy taking a place under the cap that a candidate's later task submission needed.
 */
export function attachmentRefs(thread: GmailThread, hiring = false): AttachmentRef[] {
  const out: AttachmentRef[] = [];
  const taken = new Set<string>();
  const cap = hiring ? MAX_HIRING_ATTACHMENTS_PER_THREAD : MAX_ATTACHMENTS_PER_THREAD;
  let bytes = 0;
  const walk = (messageId: string, part?: GmailPart): void => {
    if (!part || out.length >= cap) return;
    const filename = (part.filename ?? "").trim();
    const attachmentId = part.body?.attachmentId;
    const mimeType = (part.mimeType ?? "").split(";")[0]!.trim();
    const size = part.body?.size ?? 0;
    const key = `${filename}\n${size}`;
    const largePdf = hiring && mimeType === "application/pdf";
    if (
      filename &&
      attachmentId &&
      ATTACHMENT_MIMES.has(mimeType) &&
      size <= (largePdf ? MAX_HIRING_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES) &&
      (!hiring || bytes + size <= MAX_HIRING_THREAD_BYTES) &&
      // The same rule the Drive walk applies, because the same contract arrives both
      // ways. Excluding it from Drive alone left 58 chunks of the freelance contract
      // and the shareholders agreement readable through the mailbox, attached to
      // "Welcome to the Team" and to a forward of it. The covering message stays —
      // that Mark sent Eman a contract on 2026-09-09 is a real thing to remember; the
      // instrument itself does not come with it.
      !keptOut(filename, hiring) &&
      !taken.has(key)
    ) {
      taken.add(key);
      bytes += size;
      out.push({ messageId, attachmentId, filename, mimeType, size });
    }
    for (const p of part.parts ?? []) walk(messageId, p);
  };
  for (const m of thread.messages ?? []) {
    if (m.id) walk(m.id, m.payload);
  }
  // No trim needed: `walk` returns the moment the cap is reached, so `out` can never
  // exceed it. A `.slice()` here survived mutation precisely because it was dead.
  return out;
}

/** Not a file without text: a parse that ran out of time, which ends the thread's reading. */
export class ParseTimeout extends Error {}

/**
 * The text in a file, by type, within `ms`. Past it the PDF is destroyed, which ends its
 * parse at the next step instead of leaving it running beside the rest of the walk. A Word
 * file cannot be stopped that way, which is one reason it never gets the large limit.
 */
async function extract(mimeType: string, buf: Buffer, ms: number): Promise<string> {
  let doc: { destroy: () => Promise<void> } | undefined;
  const work = (async () => {
    if (mimeType === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const proxy = await getDocumentProxy(new Uint8Array(buf));
      doc = proxy.loadingTask;
      const out = await extractText(proxy, { mergePages: true });
      return Array.isArray(out.text) ? out.text.join("\n") : out.text;
    }
    if (mimeType.endsWith("wordprocessingml.document")) {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: buf })).value;
    }
    return buf.toString("utf8");
  })();
  try {
    return await withTimeout(work, ms);
  } catch (err) {
    if (!(err instanceof ParseTimeout)) throw err;
    // The parse's own rejection when the destroy lands is already handled: the race
    // subscribed to it.
    void doc?.destroy().catch(() => undefined);
    throw err;
  }
}

/** Rejects with ParseTimeout once `ms` pass, so one hostile or broken file cannot hold the walk. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ParseTimeout(`no answer in ${ms} ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Text out of one attachment; "" for a file with no text, NULL when it could not be
 * downloaded this run, PARSE_TIMED_OUT when it took too long to read. Never throws.
 *
 * The two used to be one answer, and a failed download is not a fact about the file: the
 * thread was stored without it, its historyId matched from then on, and the file was never
 * tried again.
 */
export const PARSE_TIMED_OUT = Symbol("parse timed out");
async function attachmentText(
  token: string,
  mailbox: string,
  ref: AttachmentRef
): Promise<string | null | typeof PARSE_TIMED_OUT> {
  let res: Record<string, unknown> | null;
  try {
    res = await gmailGet(
      token,
      mailbox,
      `/messages/${encodeURIComponent(ref.messageId)}/attachments/${encodeURIComponent(ref.attachmentId)}`
    );
  } catch (err) {
    logger.warn({ err, mime: ref.mimeType }, "brain-ingest gmail: attachment download failed");
    return null;
  }
  if (!res) return null;
  try {
    const data = typeof res.data === "string" ? res.data : "";
    if (!data) return "";
    // Straight from base64url: two rewritten copies of a 34 MB string were the waste.
    const buf = Buffer.from(data, "base64url");
    if (buf.byteLength === 0) return "";

    const text = await extract(ref.mimeType, buf, PARSE_TIMEOUT_MS);
    const clean = text.replace(/\r\n/g, "\n").trim();
    return clean.length > MAX_ATTACHMENT_CHARS
      ? `${clean.slice(0, MAX_ATTACHMENT_CHARS)}\n[truncated: this attachment is longer than the brain indexes]`
      : clean;
  } catch (err) {
    // One unreadable attachment must not cost the thread, let alone the walk.
    logger.warn({ err, mime: ref.mimeType }, "brain-ingest gmail: attachment unreadable");
    return err instanceof ParseTimeout ? PARSE_TIMED_OUT : "";
  }
}

/**
 * A CONTRACT OR AN OFFER BY WHAT IT SAYS, for a hiring-inbox file whose name gave nothing
 * away. Applicants' CVs, letters and tasks do not speak of "the parties" or offer anyone
 * employment; a hire's papers do.
 */
const AGREEMENT_TEXT =
  /(?<![\p{L}])(the parties|hereinafter|this (freelance |employment |internship |service )?(agreement|contract)|vertragsparteien|nachfolgend|ugovorne strane|ugovor o (radu|djelu)|we are (pleased|happy|delighted) to offer you|offer of employment)(?![\p{L}])/iu;

/** Below this an inline image is a signature logo or an icon, not something sent. */
const INLINE_IMAGE_BYTES = 50_000;

/**
 * Files in a hiring thread that give the brain no text, named so that an answer says "open
 * the email" rather than "there is no CV": measured 2026-10-13, one applicant sent their CV
 * as phone photos. A small inline picture is a signature logo, not something the applicant
 * sent; a large one is, since some mail apps put photos inline. A contract stays unnamed,
 * as it stays unread.
 */
export function unreadAttachmentNames(thread: GmailThread, read: AttachmentRef[]): string[] {
  const picked = new Set(read.map((r) => `${r.filename}\n${r.size}`));
  const out = new Set<string>();
  const walk = (part?: GmailPart): void => {
    if (!part) return;
    const filename = (part.filename ?? "").trim();
    const size = part.body?.size ?? 0;
    const disposition =
      (part.headers ?? []).find((h) => h.name?.toLowerCase() === "content-disposition")?.value ??
      "";
    if (
      filename &&
      part.body?.attachmentId &&
      !(/^\s*inline\b/i.test(disposition) && size < INLINE_IMAGE_BYTES) &&
      !keptOut(filename, true) &&
      !picked.has(`${filename}\n${size}`)
    ) {
      out.add(filename);
    }
    for (const p of part.parts ?? []) walk(p);
  };
  for (const m of thread.messages ?? []) walk(m.payload);
  return [...out];
}

export interface ThreadAttachments {
  /** The files' text, and in the hiring inbox a line naming every file not read. */
  text: string;
  /** A download failed: store what was read, and read the thread again next run. */
  retry: boolean;
}

/**
 * Reads every readable attachment of a thread, newest-first budget permitting.
 *
 * NULL WHEN THE RUN'S TIME RAN OUT FIRST. The thread must then be left whole for the next
 * run: stored now, it would keep only the files read so far, and its historyId would match
 * from then on, so the rest would never be read.
 */
export async function threadAttachmentText(
  token: string,
  mailbox: string,
  thread: GmailThread,
  isOutOfTime: () => boolean = () => false
): Promise<ThreadAttachments | null> {
  const hiring = isHiringMailbox(mailbox);
  const refs = attachmentRefs(thread, hiring);
  const parts: string[] = [];
  const unread = hiring ? unreadAttachmentNames(thread, refs) : [];
  let retry = false;
  let budget = hiring ? MAX_HIRING_ATTACHMENT_CHARS_PER_THREAD : MAX_ATTACHMENT_CHARS_PER_THREAD;
  for (const [i, ref] of refs.entries()) {
    if (budget <= 0) {
      // Past the thread's ceiling, named rather than silently dropped.
      if (hiring) unread.push(...refs.slice(i).map((r) => r.filename));
      break;
    }
    if (isOutOfTime()) return null;
    const text = await attachmentText(token, mailbox, ref);
    if (text === PARSE_TIMED_OUT) {
      // A file that would not finish is hostile or broken: its thread reads no further, so
      // a stranger's ten of them cost one parse limit, not ten.
      if (hiring) unread.push(...refs.slice(i).map((r) => r.filename));
      break;
    }
    if (text === null) retry = true;
    // A hire's contract or offer under a name that did not say so is not read. It is still
    // named: a generic name gives nothing away, and a CV wrongly caught stays visible.
    if (text && hiring && AGREEMENT_TEXT.test(text.slice(0, 4000))) {
      unread.push(ref.filename);
      continue;
    }
    if (!text) {
      if (hiring) unread.push(ref.filename);
      continue;
    }
    const kept =
      text.length > budget
        ? `${text.slice(0, budget)}\n[truncated: the rest of this thread's attachments exceed what the brain indexes]`
        : text;
    budget -= text.length;
    parts.push(`## Attachment: ${ref.filename}\n${kept}`);
  }
  if (unread.length > 0) {
    parts.push(
      `Also attached, not read by the brain (open the email to see it): ${unread.join(", ")}`
    );
  }
  return { text: parts.join("\n\n"), retry };
}

/**
 * Email text as text. HTML mail — notification templates especially — renders to runs of
 * spaces and non-breaking spaces, CRLF line ends, and zero-width non-joiners (the
 * invisible "preheader" padding), none of which carries meaning and all of which counts
 * against the 2,400-character chunk. Line breaks between paragraphs are kept; everything
 * else collapses.
 */
export function tidyEmailText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u034F\u00AD]/g, "")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function threadToRows(
  thread: GmailThread,
  mailbox: string,
  stampedAt: string,
  /**
   * The people registry, loaded ONCE per run by the caller. Passed in rather than looked
   * up here because this runs per thread and there are thousands of them -- the same
   * reason `notion.ts` passes its user directory into `pageToRow`.
   */
  byAlias: Map<string, { canonical: string }> | null = null,
  /** Text already read out of this thread's attachments, appended after the messages. */
  attachments = ""
): BrainRow[] {
  const msgs = (thread.messages ?? []).filter((m) => m.payload);
  if (!thread.id || msgs.length === 0) return [];

  const first = msgs[0]!;
  const subject = header(first, "Subject").trim() || "(no subject)";
  const last = msgs[msgs.length - 1]!;
  const when = Number(last.internalDate ?? first.internalDate ?? 0);
  const day = when ? new Date(when).toISOString().slice(0, 10) : null;
  const at = momentOf(when);

  const hiring = isHiringMailbox(mailbox);
  const lines: string[] = [];
  for (const m of msgs) {
    const from = person(header(m, "From"));
    const date = Number(m.internalDate ?? 0);
    const stamp = date ? new Date(date).toISOString().slice(0, 10) : "";
    const said = tidyEmailText(stripQuoted(messageText(m.payload)));
    if (!said) continue;
    const text = hiring ? withoutPay(said) : said;
    lines.push(`${from}${stamp ? ` (${stamp})` : ""}: ${text}`);
  }
  // In the hiring inbox nothing an applicant sends is a stub, however short, and a thread
  // whose only content is its files is still an application. A machine's short mail there
  // is a stub as anywhere (a login code or a sign-in link for the shared account), and so
  // is a colleague's: the one such thread on 2026-10-13 was a one-word "test".
  const carried = hiring && attachments.trim() !== "";
  if (lines.length === 0 && !carried) return [];
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  const applicantWrote = msgs.some((m) => fromAPerson(m) && !fromTeam(header(m, "From"), byAlias));
  const keptShort = carried || (hiring && applicantWrote);
  if (lines.length === 1 && joined.length < MIN_STUB_CHARS && !keptShort) return [];
  if (!hiring && isRecruitingThread(subject, joined)) return [];

  const participants = [
    ...new Set(
      msgs.flatMap((m) => [header(m, "From"), header(m, "To")].filter(Boolean).map(person))
    ),
  ].slice(0, 8);

  const applicant = hiring ? outsider(msgs, byAlias) : null;
  const named = applicant && !mentions(subject, applicant) ? ` (${applicant})` : "";
  const title = trustpilotReviewTitle(subject, joined, day) ?? `Email: ${subject}${named}`;
  const base: BrainRow = {
    source: SOURCE,
    source_id: `thread:${thread.id}`,
    title,
    // The mailbox by address rather than `u/0`, which is whichever account the reader
    // signed into first; the hiring inbox is a second account for everyone who reads it.
    url: `https://mail.google.com/mail/u/${mailbox === "me" ? "0" : mailbox}/#all/${thread.id}`,
    body: [
      title,
      `Between: ${participants.join(", ")}`,
      "",
      ...lines,
      ...(attachments ? ["", tidyEmailText(attachments)] : []),
    ].join("\n"),
    meta: {
      kind: "gmail-thread",
      v: GMAIL_BUILDER_VERSION,
      mailbox,
      messages: msgs.length,
      participants,
      /**
       * WHO WROTE IT, coarsely: `internal` when a message in the thread came from one of
       * our own domains, `external` when every sender is somebody else's.
       *
       * The sender's address was already being read and then thrown away by `person()`,
       * which keeps the display name only -- so "was this from a colleague or from
       * Stripe" was unanswerable from what we stored. Measured 2026-09-10: gmail took
       * rank 1 on 88 of 468 real questions and was wrong on 59% of them, against 12% for
       * repository documentation, and 77% of its rank-1 wins were vendor or notification
       * mail. The useful half is internal: the team-sync invitation is what correctly
       * answers "when is the weekly team sync".
       *
       * A THREAD is internal if ANY message in it came from us -- a vendor thread a
       * colleague replied to is a conversation we had, not a broadcast at us.
       */
      correspondents: msgs.some((m) => fromTeam(header(m, "From"), byAlias))
        ? "internal"
        : "external",
      // Bulk mail is still INDEXED -- open culture, nothing excluded -- it just
      // must not outrank a colleague's actual answer on a vague question.
      bulk: isBulkMail(msgs),
      // Gmail's own change cursor: a thread whose historyId has not moved has not
      // been replied to, so it never needs refetching.
      historyId: thread.historyId ?? null,
      // The last message, which `day` is the day of.
      ...(at ? { at } : {}),
    },
    updated_at: stampedAt,
    // The Berlin day of the last message. `day` stays UTC for the review title above.
    period_end: dayOfMoment(at),
  };

  const parts = splitBody(base.body);
  return parts.map((body, i) =>
    i === 0
      ? { ...base, body }
      : {
          ...base,
          source_id: `${base.source_id}#${i + 1}`,
          title: `${title} (part ${i + 1} of ${parts.length})`,
          body,
          meta: { ...base.meta, part: i + 1, parts: parts.length },
        }
  );
}

/**
 * source_id -> what we already hold for it.
 *
 * `current` is false when the row was built by an older builder version. Such a row
 * must never be TOUCHED: touching says "this is still correct", so a chunk that the
 * current rules would no longer produce — a notification stub, under v2 — would be
 * confirmed forever and never fall to the sweep. Measured: 30 stub threads survived
 * the v2 rebuild exactly this way.
 */
async function knownThreads(): Promise<
  Map<string, { historyId: string | null; current: boolean; mailbox: string | null }>
> {
  const out = new Map<
    string,
    { historyId: string | null; current: boolean; mailbox: string | null }
  >();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    // Fails closed on an unreadable status AND on an unreadable body. See chunkPage.
    const batch = await chunkPage<{
      source_id?: string;
      meta?: { historyId?: string | null; v?: number; mailbox?: string | null } | null;
    }>("gmail", res);
    for (const r of batch) {
      if (!r.source_id) continue;
      const current = r.meta?.v === GMAIL_BUILDER_VERSION;
      out.set(r.source_id, {
        historyId: current ? (r.meta?.historyId ?? null) : null,
        current,
        mailbox: typeof r.meta?.mailbox === "string" ? r.meta.mailbox : null,
      });
    }
    if (batch.length < 1000) break;
  }
  return out;
}

/**
 * Threads read and deliberately NOT indexed, with the version they were refused at.
 *
 * A refused thread (a stub, a job application, a legal instrument) stores nothing in
 * brain_chunk, so `knownThreads` has no historyId for it and every run fetched it again:
 * about a hundred threads an hour, each a full fetch plus its attachments, re-deciding what
 * was already decided. The version is the builder version plus the thread's historyId, so
 * a new message or a change to the rules gets it read again.
 *
 * Fails OPEN, unlike `knownThreads`: an unreadable log only means re-reading everything,
 * exactly as before it existed.
 */
async function knownRefusals(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_refusal_log?select=source_id,version&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    const batch = res.ok
      ? ((await res.json().catch(() => null)) as Array<{
          source_id?: string;
          version?: string;
        }> | null)
      : null;
    if (!Array.isArray(batch)) {
      logger.warn({ status: res.status }, "brain-ingest gmail: refusal log unreadable, re-reading");
      return new Map();
    }
    for (const r of batch) if (r.source_id && r.version) out.set(r.source_id, r.version);
    if (batch.length < 1000) break;
  }
  return out;
}

const refusalVersion = (historyId: string) => `${GMAIL_BUILDER_VERSION}:${historyId}`;

/** Remember this run's refusals. A failure costs one more re-read next run, nothing else. */
async function recordRefusals(refused: Map<string, string>, stampedAt: string): Promise<void> {
  const rows = [...refused].map(([source_id, historyId]) => ({
    source: SOURCE,
    source_id,
    version: refusalVersion(historyId),
    refused_at: stampedAt,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const res = await supabaseFetch("/rest/v1/brain_refusal_log?on_conflict=source,source_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, refused: rows.length },
        "brain-ingest gmail: could not record refused threads; they will be read again next run"
      );
      return;
    }
  }
}

export async function ingestGmail(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  oidcToken?: string | null
): Promise<IngestResult> {
  if (isOutOfTime()) {
    // Never started, which is not the same as started and truncated — and with a
    // bare `skipped` the two were indistinguishable in `cron_run`.
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "gmail-time-budget",
      complete: false,
      detail: "stopped=time-budget@before-walk",
    };
  }
  const own = await getGoogleAccessToken(Date.now(), oidcToken);
  if (!own) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "google-token-unavailable",
      complete: false,
      detail: `stopped=no-own-token credential=${googleCredentialShape(oidcToken)}`,
    };
  }

  /**
   * A token PER MAILBOX. `me` uses the credential's own token; a named address
   * needs a delegated one, because a user OAuth token reaches only its own mail
   * whatever scope it carries.
   *
   * Minted once per mailbox rather than per request — each one costs a signJwt and
   * a token exchange, and at ~2,400 threads that would otherwise be thousands of
   * round trips.
   */
  const tokenFor = async (mailbox: string): Promise<string | null> =>
    mailbox === "me" ? own : getDelegatedToken(mailbox, GMAIL_SCOPE, Date.now(), oidcToken);

  /**
   * Ask the directory who works here; fall back to the configured list. An empty
   * or failed directory answer must NOT be read as "nobody works here" — that
   * would list no mailboxes, write nothing, and let the sweep delete the corpus.
   */
  const discovered = await domainMailboxes(oidcToken);
  const boxes = excludeMailboxes(discovered && discovered.length > 0 ? discovered : mailboxes())
    // Lower case everywhere, so the readers that leave the hiring inbox out by address
    // (the brief, comment asks) match whatever case the configuration was written in.
    .map((m) => m.trim().toLowerCase())
    .filter((m) => !NEVER_INDEX_MAILBOXES.has(m))
    // The hiring inbox last: a stranger decides what arrives there, so if a flood of it
    // uses up a run, colleagues' mail has been read already.
    .sort((a, b) => Number(isHiringMailbox(a)) - Number(isHiringMailbox(b)));

  const known = await knownThreads();
  const refusedBefore = await knownRefusals();
  /**
   * The people registry, once for the whole walk.
   *
   * It is what tells a colleague's personal gmail address from a vendor's -- two of the
   * team write from one, so the sending DOMAIN alone gets them exactly backwards. Null
   * when the registry cannot be read, which degrades to the domain check rather than
   * misclassifying everything as external.
   */
  const people = await loadPeople();
  const rows: BrainRow[] = [];
  const seen = new Set<string>();
  let complete = true;
  /**
   * WHICH of the six ways to stop actually happened, first one wins.
   *
   * `complete=false` alone is not a diagnosis, and for gmail that mattered:
   * `brain_sweep_state` has no gmail row at all, so the walk has NEVER completed —
   * yet every hourly run recorded `success` with an empty `error_message`, because
   * `gmail-walk-in-progress` is a deliberate skip. Six different faults all looked
   * identical from SQL, and the one line that could tell them apart went only to a
   * log stream that cannot be queried after the fact.
   */
  let stopReason = "";
  const stop = (why: string) => {
    complete = false;
    if (!stopReason) stopReason = why;
  };
  /**
   * WHY the walk is incomplete decides whether anyone should be woken up.
   *
   * Running out of page budget is expected and self-healing: the next run picks up
   * where this one stopped. A mailbox we cannot get a token for, a listing Gmail
   * refuses, or thread fetches failing en masse are faults that will not fix
   * themselves. Both suppress the sweep; only the second kind should alert.
   */
  let degraded = false;
  let fetched = 0;
  /** Threads whose attachments contributed text, reported so the gap stays visible. */
  let attachmentsRead = 0;
  /** Threads stored with a file that failed to download, read again next run. */
  let retried = 0;
  /** Attachment bytes the hiring inbox has downloaded this run: see HIRING_RUN_BYTES. */
  let hiringBytes = 0;

  const failedMailboxes: string[] = [];
  /** Threads we listed but could not re-read this run. Protected from the sweep. */
  const failedThreads = new Set<string>();
  /**
   * Threads we listed, re-read, and deliberately did not index — a stub, or anything
   * `threadToRows` refuses. Reaching a thread and deciding against it is a decision, so
   * its old rows belong to the sweep; this is the Drive ingester's `reached` rule.
   */
  const refusedThreads = new Set<string>();
  /** Refused on THIS run's read, with the historyId the listing gave: the log's new rows. */
  const newlyRefused = new Map<string, string>();
  /** Refused before and unchanged since, so not fetched at all. */
  let refusedUnchanged = 0;

  for (const mailbox of boxes) {
    const token = await tokenFor(mailbox);
    if (!token) {
      // One unreachable mailbox must not fail the others, and must not let the
      // sweep run as if that person's mail had been deleted.
      logger.warn({ mailbox }, "brain-ingest gmail: no token for this mailbox, skipping it");
      failedMailboxes.push(mailbox);
      stop(`no-token@${mailbox}`);
      degraded = true; // a mailbox we cannot reach will not fix itself
      continue;
    }
    const hiring = isHiringMailbox(mailbox);
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      if (isOutOfTime()) {
        stop(`time-budget@${mailbox}:p${page}`);
        break;
      }
      const listed = await gmailGet(
        token,
        mailbox,
        `/threads?maxResults=${PAGE_SIZE}&q=${encodeURIComponent((hiring ? EXCLUDE_HIRING : EXCLUDE + notHiringCopies()) + standingExclusionsQuery(hiring) + excludeSubjects())}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
      );
      if (!listed) {
        stop(`listing-refused@${mailbox}:p${page}`);
        degraded = true; // Gmail refused the listing -- the 2026-08-30 outage shape
        break;
      }
      const threads = (listed.threads as GmailThread[]) ?? [];

      for (const t of threads) {
        if (!t.id) continue;
        const id = `thread:${t.id}`;
        seen.add(id);
        // Gmail's historyId moves whenever a thread changes, so an unchanged
        // thread costs one listing entry and no fetch at all.
        const have = known.get(id);
        if (have?.current && have.historyId && have.historyId === t.historyId) continue;
        // Read before and refused, and unchanged since: the same decision, for free. Still
        // a refusal as far as the sweep is concerned, so rows it has from before are not kept.
        if (t.historyId && refusedBefore.get(id) === refusalVersion(t.historyId)) {
          refusedThreads.add(id);
          refusedUnchanged += 1;
          continue;
        }
        if (isOutOfTime()) {
          stop(`time-budget@${mailbox}:p${page}:mid-page`);
          break;
        }
        const full = (await gmailGet(
          token,
          mailbox,
          `/threads/${encodeURIComponent(t.id)}?format=full`
        )) as GmailThread | null;
        if (!full) {
          // NOT `complete = false`. A thread can be deleted between the listing and
          // the fetch, and one such 404 must not block the sweep for the other
          // 3,900. The id is remembered so its existing rows are protected below;
          // a systemic failure trips the threshold instead.
          failedThreads.add(id);
          continue;
        }
        fetched += 1;
        if (hiring) {
          // A thread's files stop at MAX_HIRING_THREAD_BYTES, well inside a run's budget, so
          // the first thread of a run always fits and the walk always moves.
          const bytes = attachmentRefs(full, true).reduce((n, r) => n + r.size, 0);
          if (hiringBytes + bytes > HIRING_RUN_BYTES) {
            stop(`hiring-byte-budget@${mailbox}:p${page}`);
            break;
          }
          hiringBytes += bytes;
        }
        const attached = await threadAttachmentText(token, mailbox, full, isOutOfTime);
        if (attached === null) {
          stop(`time-budget@${mailbox}:p${page}:attachments`);
          break;
        }
        if (attached.text) attachmentsRead += 1;
        const built = threadToRows(full, mailbox, stampedAt, people, attached.text);
        // A file that failed to download: what was read is stored, without the historyId
        // that would let the next run skip the thread, so the file is tried again.
        if (attached.retry) {
          retried += 1;
          for (const r of built) r.meta = { ...r.meta, historyId: null };
        }
        if (built.length === 0) {
          refusedThreads.add(id);
          if (t.historyId) newlyRefused.set(id, t.historyId);
        }
        rows.push(...built);
      }

      pageToken = (listed.nextPageToken as string) ?? "";
      if (!pageToken) break;
      if (page === MAX_PAGES - 1) stop(`page-cap@${mailbox}`);
    }
  }

  if (failedThreads.size > MAX_TOLERATED_THREAD_FAILURES) {
    logger.warn(
      { failed: failedThreads.size, limit: MAX_TOLERATED_THREAD_FAILURES },
      "brain-ingest gmail: too many thread fetches failed, treating the walk as incomplete"
    );
    stop(`thread-fetch-failures=${failedThreads.size}`);
    degraded = true; // systemic, not the one-deleted-thread case handled above
  }

  const written = await upsertChunks(rows);
  // Only successful reads reach `newlyRefused`: a fetch that failed is never recorded as a
  // decision, so it is simply fetched again (see "an outage is not a decision").
  await recordRefusals(newlyRefused, stampedAt);
  /**
   * Mailboxes this run walked — the only ones the sweep may judge.
   *
   * No need to subtract `failedMailboxes`: a mailbox we could not reach already
   * sets `complete = false`, and the sweep does not run at all on an incomplete
   * walk. Filtering here as well would be unreachable code.
   */
  const walked = new Set(boxes);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const rewritten = new Set([...writtenIds].map((id) => id.split("#")[0]));
  /**
   * NO TOUCH. Gmail is 9,074 rows, which is 91 confirm requests against a 60s
   * ceiling, and it hit the 8s per-request timeout at 11:11 on 2026-08-31. Drive,
   * larger, failed the same way three hours running. A confirm pass that cannot
   * finish inside one invocation cannot be scheduled into working.
   *
   * The list below is unchanged -- it is precisely "ids that legitimately exist and
   * must not be swept". It used to be written to; now it is simply handed to
   * `sweepMissing` as the set to keep. Same decisions, no writes.
   */
  const confirmed = ((): string[] =>
    [...known.entries()]
      .filter(([id, have]) => {
        if (writtenIds.has(id)) return false;
        const base = id.split("#")[0] ?? id;
        if (rewritten.has(base)) return false;
        /**
         * A thread we FAILED to re-read is confirmed regardless of builder version.
         * We could not look at it, so we know nothing new about it — and deleting
         * a real thread because one fetch returned 404 is far worse than carrying
         * a chunk in an older shape until the next run rewrites it.
         */
        if (failedThreads.has(base)) return true;
        /**
         * A row from a mailbox THIS WALK DID NOT COVER is not missing — it is
         * history, and the sweep has no evidence about it either way.
         *
         * `domainMailboxes` lists `isSuspended=false` users, so an offboarded
         * colleague drops off the list the day their account is suspended. Their
         * mail is then never listed, never written, and — being stale-version by
         * the next builder bump — never confirmed, so `sweepMissing` reads it as
         * deleted. Measured 2026-09-06: 232 rows across philipp.leonhard@, sk@ and
         * teamwork@ were in exactly that state, 3.3% of the source, which clears
         * the majority guard comfortably. The first walk to complete would have
         * deleted every one of them, silently, and the doc comment on
         * `domainMailboxes` promises the opposite: "a departed colleague's mail
         * stays in the corpus as history but stops being re-read."
         *
         * An unattributable row (no mailbox in `meta`) is kept for the same
         * reason — absence of evidence is not evidence of deletion.
         */
        // Never-index mailboxes are not history, they are a decision: not kept. Nor is a
        // hiring inbox this walk did not cover: applicants' CVs stay only as long as the
        // mailbox holds them, so a suspended or excluded hr@ takes its rows with it.
        if (have.mailbox && NEVER_INDEX_MAILBOXES.has(have.mailbox.toLowerCase())) return false;
        if (have.mailbox && isHiringMailbox(have.mailbox) && !walked.has(have.mailbox)) {
          return false;
        }
        if (!have.mailbox || !walked.has(have.mailbox)) return true;
        // Never confirm a stale-version row FROM A MAILBOX WE DID WALK. It was
        // either dropped from the source or is no longer something we would index
        // (a stub, under v2); either way it belongs to the sweep, not the keep set.
        //
        // AND A CURRENT ROW ONLY IF THIS WALK STILL LISTED ITS THREAD, and did not
        // refuse it on re-reading. The doc comments on `excludeSubjects` and CLAUDE.md
        // both promise that "sweepMissing keeps anything in `seen`" — so an excluded or
        // deleted thread, never listed, is swept. This line never consulted `seen`, before
        // or after the 2026-08-31 refactor: any current-version row was kept, listed or
        // not. Exclusions only ever took effect when a builder bump happened to make the
        // old rows stale. Found 2026-09-23 while excluding job applications, which would
        // otherwise have stayed indexed until the next unrelated bump.
        return have.current && seen.has(base) && !refusedThreads.has(base);
      })
      .map(([id]) => id))();
  const touched = confirmed.length;

  // Sweep only a complete walk; a truncated one makes real threads look deleted.
  // Once a day, not every run -- see shouldSweep.
  const sweeping = complete && (await shouldSweep(SOURCE));
  // Recorded BEFORE the sweep: a throw after the record defers 20 hours, a throw
  // before it retried hourly forever.
  if (sweeping) await recordSweep(SOURCE);
  const swept = sweeping
    ? await sweepMissing(SOURCE, new Set([...writtenIds, ...confirmed]), {
        scopeKey: "mailbox",
      })
    : 0;

  logger.info(
    {
      mailboxes: boxes.length,
      discovered: discovered?.length ?? null,
      unreachable: failedMailboxes,
      listed: seen.size,
      fetched,
      refusedUnchanged,
      written,
      touched,
      complete,
      degraded,
    },
    "brain-ingest gmail"
  );

  /**
   * The same facts, in the one place that can still be read tomorrow. Counts and
   * mailbox addresses only — the addresses are already all over the corpus.
   */
  const detail =
    `boxes=${boxes.length}${discovered ? "" : "(directory unavailable, fell back)"} ` +
    `listed=${seen.size} fetched=${fetched} written=${written} kept=${touched} ` +
    (refusedUnchanged > 0 ? `refused_unchanged=${refusedUnchanged} ` : "") +
    (attachmentsRead > 0 ? `attachments=${attachmentsRead} ` : "") +
    (retried > 0 ? `attachment_retries=${retried} ` : "") +
    `swept=${swept} complete=${complete}` +
    (stopReason ? ` stopped=${stopReason}` : "") +
    (failedMailboxes.length ? ` unreachable=${failedMailboxes.join(",")}` : "");

  /**
   * ORDER MATTERS, and getting it wrong hid a total outage.
   *
   * `gmail-nothing-to-index` is a DELIBERATE skip: it reports success and never
   * alerts, because "the mailbox is empty" is not a fault. But it was checked
   * FIRST, so a run where the Gmail API refused every request — listing nothing,
   * fetching nothing, writing nothing — also matched it and reported success.
   *
   * That is exactly what happened on 2026-08-30: delegation stopped resolving
   * mailboxes, Gmail answered 400 "Precondition check failed" to every listing,
   * and the only thing keeping the failure visible was that the run still TOUCHED
   * 9,061 existing rows. The moment a builder bump stopped those touches — correct
   * behaviour, since a stale-version row must not be confirmed — the same broken
   * run started reporting success instead.
   *
   * An incomplete walk is never "nothing to index". Checking `complete` first is
   * what keeps a silent outage loud.
   */
  /**
   * But "incomplete" alone is not "broken", and treating it as such created the
   * MIRROR of the bug above.
   *
   * A builder bump re-walks ~9,000 threads, which does not fit in one 60s run. The
   * walk advances a few hundred threads per hourly run and converges over ~18 hours
   * — every one of those runs is incomplete, and every one was reporting `error`.
   * An alert that is red for 18 predictable hours cannot show a real Gmail outage
   * inside that window; the permanent red hides exactly what the loud skip existed
   * to reveal.
   *
   * Progress is the signal that separates them. A run that WROTE rows reached Gmail
   * and is converging. A run that wrote nothing AND could not finish is the outage
   * shape from 2026-08-30 — nothing listed, nothing fetched, nothing written.
   *
   * Both still skip the sweep (above), so neither can delete live threads.
   */
  if (!complete) {
    // Quiet ONLY for a budget-truncated walk that actually advanced. A truncated
    // walk that wrote nothing is a stall, not progress -- that is how a mis-set
    // time budget would otherwise defer every run forever in silence.
    // `written`, NOT `written + touched`. `touched` is derived from `known` -- the
    // rows the DATABASE already holds -- so in production it is ~9,000 whether or
    // not Gmail answered a single request, and the sum is satisfied by the corpus
    // rather than by the run. That made the loud branch reachable only while the
    // corpus was EMPTY: once, ever, after a builder bump.
    //
    // Measured live on 2026-09-06: `brain_sweep_state` has no gmail row at all, so
    // gmail has never once completed a walk -- across 24 consecutive runs in 24
    // hours, every one recorded `success` with no error. The comment above already
    // said what it wanted ("a truncated walk that wrote nothing is a stall, not
    // progress"); the expression just measured the wrong thing.
    const converging = !degraded && written > 0;
    return {
      source: SOURCE,
      rows: written + touched,
      swept,
      skipped: converging ? "gmail-walk-in-progress" : "gmail-walk-incomplete",
      complete,
      detail,
    };
  }
  if (written === 0 && touched === 0) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: "gmail-nothing-to-index",
      complete,
      detail,
    };
  }
  return { source: SOURCE, rows: written + touched, swept, complete, detail };
}
