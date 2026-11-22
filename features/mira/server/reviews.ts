import { revalidateTag, unstable_cache } from "next/cache";
import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import {
  MESSAGES_TO_RATE,
  ageLabel,
  counts,
  publicReviews,
  redacted,
  type AgeRange,
  type PublicReviews,
  type RejectReason,
  type ReviewRow,
} from "../reviews";

/**
 * Mira's ratings and quotes in the database (supabase/migrations/20261122080000_mira_reviews.sql),
 * with the service role, from API routes. What may be shown is decided in ../reviews.ts.
 */

/** The cache tag of the public figures. */
export const REVIEWS_TAG = "mira-reviews";

/** The columns publicReviews reads; the account tells the team and under-18s apart. */
const PUBLIC_COLS =
  "id,stars,quote_status,published_quote,display_name,age_range,consent_at,from_team,mira_user!inner(email,is_team,minor_at)";

const enc = encodeURIComponent;

/**
 * The public figures, read at most once a minute and at once after a withdrawal or a decision
 * (refreshPublicReviews). The minute also bounds a narrow race: a read that began before a
 * withdrawal and finished after its refresh is stored, but only until then. Only what may be
 * shown is cached, never an address. A failed read throws: nothing shows rather than something
 * wrong.
 */
export const cachedPublicReviews = unstable_cache(
  async (): Promise<PublicReviews | null> => {
    const rows = await fetchAllRows<ReviewRow>(
      `/rest/v1/mira_review?select=${PUBLIC_COLS}&order=id.asc`
    );
    if (!rows) throw new Error("mira reviews could not be read");
    return publicReviews(rows);
  },
  ["mira-reviews-public-v1"],
  { tags: [REVIEWS_TAG], revalidate: 60 }
);

/**
 * The next request anywhere recomputes the public figures, so words taken back, a rating
 * removed, an account deleted or a quote taken down stop showing at once. Outside a request (a
 * script, a test) there is no cache to clear.
 */
export function refreshPublicReviews(): void {
  try {
    revalidateTag(REVIEWS_TAG, { expire: 0 });
  } catch (err) {
    logger.error({ err }, "mira: the public ratings were not refreshed");
  }
}

/**
 * Whether the account has talked with Mira: MESSAGES_TO_RATE messages of its own in its saved
 * chats or, as "Remember our conversations" off saves none, in the server's own message_sent
 * events (the browser can't log those). Each read stops at that many rows. Every rating comes
 * through this check, so the public threshold counts only such accounts. A failed read throws:
 * nobody is let in on an error.
 */
export async function hasTalkedWithMira(userId: string): Promise<boolean> {
  const id = enc(userId);
  for (const path of [
    `/rest/v1/mira_message?select=id,mira_chat!inner(user_id)&mira_chat.user_id=eq.${id}&role=eq.user`,
    `/rest/v1/mira_event?user_id=eq.${id}&name=eq.message_sent&select=id`,
  ]) {
    const res = await supabaseFetch(`${path}&limit=${MESSAGES_TO_RATE}`);
    if (!res.ok) throw new Error(`mira message count failed (${res.status})`);
    if (((await res.json()) as unknown[]).length >= MESSAGES_TO_RATE) return true;
  }
  return false;
}

/** What a person shared, as Settings shows it. */
export type MyReview = {
  stars: number;
  createdAt: string;
  /** Their words as written, and as shown once approved; null: none (or taken back). */
  quote: string | null;
  published: string | null;
  status: ReviewRow["quote_status"];
  /** Why the team didn't show the words (status "rejected"); null otherwise. */
  reason: RejectReason | null;
  name: string | null;
  age: string | null;
};

export async function getMyReview(userId: string): Promise<MyReview | null> {
  const res = await supabaseFetch(
    `/rest/v1/mira_review?user_id=eq.${enc(userId)}&select=stars,created_at,quote,published_quote,quote_status,reject_reason,display_name,age_range&limit=1`
  );
  if (!res.ok) throw new Error(`mira review read failed (${res.status})`);
  const [r] = (await res.json()) as Array<{
    stars: number;
    created_at: string;
    quote: string | null;
    published_quote: string | null;
    quote_status: ReviewRow["quote_status"];
    reject_reason: RejectReason | null;
    display_name: string | null;
    age_range: string | null;
  }>;
  return r
    ? {
        stars: r.stars,
        createdAt: r.created_at,
        quote: r.quote,
        published: r.published_quote,
        status: r.quote_status,
        reason: r.reject_reason ?? null,
        name: r.display_name,
        age: ageLabel(r.age_range),
      }
    : null;
}

export type NewReview = {
  stars: number;
  via: "settings" | "ask";
  words?: { quote: string; name: string; ageRange?: AgeRange | null; consent: string };
};

/** The person's one rating, with words only beside their consent; false: they rated already. */
export async function addReview(
  userId: string,
  review: NewReview,
  fromTeam: boolean
): Promise<boolean> {
  const w = review.words;
  const res = await supabaseFetch("/rest/v1/mira_review", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      stars: review.stars,
      via: review.via,
      from_team: fromTeam,
      ...(w
        ? {
            quote: w.quote,
            display_name: w.name,
            age_range: w.ageRange ?? null,
            consent_version: w.consent,
            consent_at: new Date().toISOString(),
            quote_status: "pending",
          }
        : {}),
    }),
  });
  if (res.status === 409) return false; // one per account (UNIQUE user_id)
  if (!res.ok) throw new Error(`mira review insert failed (${res.status})`);
  return true;
}

/** Words gone: taken back, rejected or taken down. The table allows no words without consent. */
const NO_WORDS = {
  quote: null,
  published_quote: null,
  display_name: null,
  age_range: null,
  consent_version: null,
  consent_at: null,
};

/** Takes back the person's words, or their whole rating; shown nowhere from the next request. */
export async function withdrawReview(userId: string, what: "words" | "all"): Promise<void> {
  const mine = `/rest/v1/mira_review?user_id=eq.${enc(userId)}`;
  const res =
    what === "all"
      ? await supabaseFetch(mine, { method: "DELETE" })
      : await supabaseFetch(`${mine}&quote_status=in.(pending,approved)`, {
          method: "PATCH",
          body: JSON.stringify({
            ...NO_WORDS,
            quote_status: "none",
            reviewed_at: null,
            reviewed_by: null,
          }),
        });
  if (!res.ok) throw new Error(`mira review withdrawal failed (${res.status})`);
  refreshPublicReviews();
}

/** A quote for the team to read: waiting, or shown now (which can be taken down). */
export type QuoteToReview = {
  id: number;
  stars: number;
  quote: string;
  published: string | null;
  name: string;
  age: string | null;
  status: "pending" | "approved";
  createdAt: string;
  /** False for the team's own or an under-18's words: never shown, whatever is decided. */
  counts: boolean;
};

export async function quotesToReview(): Promise<QuoteToReview[]> {
  const rows = await fetchAllRows<
    ReviewRow & { quote: string; created_at: string; quote_status: "pending" | "approved" }
  >(
    `/rest/v1/mira_review?quote_status=in.(pending,approved)&select=${PUBLIC_COLS},quote,created_at&order=id.asc`
  );
  if (!rows) throw new Error("mira quotes could not be read");
  return rows.map((r) => ({
    id: r.id,
    stars: r.stars,
    quote: r.quote,
    published: r.published_quote,
    name: r.display_name ?? "",
    age: ageLabel(r.age_range),
    status: r.quote_status,
    createdAt: r.created_at,
    counts: counts(r),
  }));
}

export type Decision =
  | { id: number; decision: "approve"; text: string }
  | { id: number; decision: "reject"; reason: RejectReason };

/**
 * The team's decision on a quote: approve it (as written, or with identifying details replaced
 * by […], nothing else), or reject or take it down for one of REJECT_REASONS, which deletes the
 * words and keeps the reason for the writer. "gone": the person took them back, or someone
 * decided first; "edited": the text is not their words.
 */
export async function decideQuote(
  d: Decision,
  staffEmail: string
): Promise<"done" | "gone" | "edited"> {
  const row = `/rest/v1/mira_review?id=eq.${d.id}`;
  const reviewed = { reviewed_at: new Date().toISOString(), reviewed_by: staffEmail };
  let res: Response;
  if (d.decision === "approve") {
    const found = await supabaseFetch(`${row}&quote_status=eq.pending&select=quote&limit=1`);
    if (!found.ok) throw new Error(`mira quote read failed (${found.status})`);
    const [current] = (await found.json()) as Array<{ quote: string }>;
    if (!current) return "gone";
    const text = redacted(current.quote, d.text);
    if (text === null) return "edited";
    res = await supabaseFetch(`${row}&quote_status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ quote_status: "approved", published_quote: text, ...reviewed }),
    });
  } else {
    res = await supabaseFetch(`${row}&quote_status=in.(pending,approved)`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...NO_WORDS,
        quote_status: "rejected",
        reject_reason: d.reason,
        ...reviewed,
      }),
    });
  }
  if (!res.ok) throw new Error(`mira quote decision failed (${res.status})`);
  if (((await res.json()) as unknown[]).length === 0) return "gone";
  refreshPublicReviews();
  return "done";
}
