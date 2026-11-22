"use client";

import { useEffect, useRef, useState } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type { MiraPayload } from "@features/admin/server/ap/mira";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import {
  REJECT_REASONS,
  REJECT_REASON_LABEL,
  redacted,
  type RejectReason,
} from "@features/mira/reviews";
import type { QuoteToReview } from "@features/mira/server/reviews";
import { getCsrfToken } from "@shared/http/csrf-client";

import { BlackButton, Card, SectionHead, StatBox } from "./kit";

const NOTE = "m-0 text-xs leading-relaxed text-ap-muted";
const SECONDARY =
  "min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-4 text-sm font-semibold text-ap-ink disabled:cursor-not-allowed disabled:opacity-50";
const count = (n: number) => fmt("count", n);
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/**
 * AP › Mira's "Ratings" card (features/admin/server/ap/mira-ratings.ts): ratings from Settings
 * and the thank-you ask, what Mira's pages show of them, and the quotes the team reads before
 * anything shows.
 */
export function RatingsCard({ data }: { data: MiraPayload }) {
  const r = data.ratings;
  if (!r) return null;
  const live = r.live;
  return (
    <Card id="ratings" labelledBy="h-ratings">
      <SectionHead
        id="h-ratings"
        level={3}
        title="Ratings"
        description="Ratings from Settings, open to anyone who has talked with Mira, and from the thank-you ask in the chat (after a 9 or 10 on the recommend question or a third thumbs-up in one chat): who rates her, the words they share, and what her pages show."
        right={
          <span className="font-serif text-[24px] font-semibold tabular-nums">
            {r.average === null ? EMPTY : `★ ${fmt("ratio", r.average)}`}
          </span>
        }
      />
      {!r.read ? (
        <p role="alert" className="m-0 text-sm text-ap-bad-ink">
          The ratings table could not be read, so the average and the quotes are missing. The asks
          and withdrawals below come from the event log.
        </p>
      ) : null}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{
            label: "Asks shown",
            unit: "count",
            value: r.asked,
            note: `${count(r.notNow)} “Not now”`,
          }}
        />
        <StatBox
          stat={{
            label: "Ratings given",
            unit: "count",
            value: r.given,
            note: `${fmt("pct", r.asked ? r.afterAsk / r.asked : null)} of the asks · ${count(r.fromSettings)} from Settings`,
          }}
        />
        <StatBox
          stat={{
            label: "Average rating",
            unit: "ratio",
            value: r.average,
            note: `of ${plural(r.averaged, "rating", "ratings")} that still stand`,
          }}
        />
        <StatBox
          stat={{
            label: "Quotes submitted",
            unit: "count",
            value: r.words,
            note: `${count(r.approved)} approved in the range, ${count(r.waiting)} waiting now`,
          }}
        />
        <StatBox
          stat={{
            label: "Withdrawals",
            unit: "count",
            value: r.withdrawn,
            note: "words or a whole rating taken back",
          }}
        />
      </div>
      <p className="m-0 text-sm leading-relaxed text-ap-body">
        {live.average !== null
          ? `On Mira's pages now: ★ ${fmt("ratio", live.average)}, rated by ${count(live.people)} people, with ${plural(live.quotes, "approved quote", "approved quotes")} taking turns, one a day.`
          : `Not on Mira's pages yet: ${count(live.people)} of the ${count(live.needs)} people needed have rated her, with ${plural(live.quotes, "approved quote", "approved quotes")}. Nothing shows until ${count(live.needs)} have rated and a quote is approved.`}
      </p>
      <QuoteReview />
      <p className={NOTE}>
        Asks, “Not now”, ratings given and withdrawals are counted in the range, the team&rsquo;s
        left out. Where ratings came from (after an ask or in Settings), the average and the quotes
        are of the range&rsquo;s ratings that still stand: a rating taken back leaves them, and
        counts as a withdrawal. A person rates once, and only after three messages of their own to
        Mira; the ask shows at most once in 30 days per browser, never near a crisis, an under-18
        stop, a referral or the body check. Mira&rsquo;s pages count every rating, high or low,
        except the team&rsquo;s and those of anyone under 18. Recorded from 22 Nov 2026.
      </p>
    </Card>
  );
}

/**
 * The words people agreed to show: approve them as written, or with anything that could identify
 * someone replaced by a visible […] (the only edit their consent allows), reject them, or take
 * an approved one down, each only for one of REJECT_REASONS, never because the words are
 * critical (no selective publication, UWG Annex no. 23c). Rejecting deletes the words; the
 * writer sees the reason in Settings.
 */
function QuoteReview() {
  const url = "/api/admin/ap/mira/reviews";
  const { data, error, refetch } = useAdminFetch<{ quotes?: QuoteToReview[] }>(url);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  // The quote whose reason is being picked, before it is rejected or taken down.
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const quotes = data?.quotes ?? [];
  const waiting = quotes.filter((q) => q.status === "pending");
  const shown = quotes.filter((q) => q.status === "approved");

  async function decide(
    body:
      | { id: number; decision: "approve"; text: string }
      | { id: number; decision: "reject"; reason: RejectReason }
  ) {
    setBusy(true);
    setFailed(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
      body: JSON.stringify(body),
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setFailed(out?.error ?? "Not saved. Please try again.");
    setEditing(null);
    setRejecting(null);
    refetch();
  }

  /** "Reject…" or "Take down…": the reasons in place of the buttons. */
  const whyNot = (q: QuoteToReview, verb: "Reject" | "Take down") => (
    <ReasonPicker
      id={q.id}
      verb={verb}
      busy={busy}
      onCancel={() => setRejecting(null)}
      onPick={(reason) => void decide({ id: q.id, decision: "reject", reason })}
    />
  );

  const who = (q: QuoteToReview) => (
    <>
      <span aria-hidden="true">{"★".repeat(q.stars) + "☆".repeat(5 - q.stars)}</span>
      <span className="sr-only">{q.stars} of 5 stars</span>
      {` · ${q.name}${q.age ? `, ${q.age}` : ""} · ${shortDate(q.createdAt.slice(0, 10))}`}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <h4 className="m-0 font-serif text-lg font-semibold text-ap-ink">
        Quotes to read{waiting.length ? ` (${waiting.length})` : ""}
      </h4>
      <p className={NOTE}>
        Critical or negative words are never a reason to reject or take down a quote. Approve them
        like any other; a quote goes only if we can&rsquo;t remove identifying details, it is
        harmful or abusive, it isn&rsquo;t about Mira, or it is spam or a duplicate.
      </p>
      {error ? (
        <p className="m-0 text-sm text-ap-bad-ink">The quotes could not be loaded: {error}</p>
      ) : waiting.length === 0 ? (
        <p className={NOTE}>No words are waiting.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {waiting.map((q) => {
            const edit = editing?.id === q.id ? editing : null;
            const cutOk = edit ? redacted(q.quote, edit.text) !== null : true;
            return (
              <li
                key={q.id}
                className="flex flex-col gap-2 rounded-[14px] border border-ap-line p-4"
              >
                <p className="m-0 text-xs text-ap-muted">
                  {who(q)}
                  {q.counts ? null : (
                    <strong className="ml-1 font-semibold text-ap-ink">
                      · Never shown: the team&rsquo;s own, or someone under 18
                    </strong>
                  )}
                </p>
                {edit ? (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Replace anything that could identify someone with […]
                    <textarea
                      value={edit.text}
                      onChange={(e) => setEditing({ id: q.id, text: e.target.value })}
                      rows={3}
                      className="rounded-[12px] border border-ap-line p-3 font-serif text-[15px] font-normal italic text-ap-ink outline-none focus:border-ap-purple"
                    />
                    {cutOk ? null : (
                      <span className="text-xs font-normal text-ap-bad-ink">
                        Only take out a detail of up to three words, marked […], and never a “not”.
                        Nothing may be added or changed.
                      </span>
                    )}
                  </label>
                ) : (
                  <blockquote className="m-0 font-serif text-[15px] italic leading-relaxed text-ap-ink">
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                )}
                {rejecting === q.id ? (
                  whyNot(q, "Reject")
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {edit ? (
                      <>
                        <BlackButton
                          disabled={busy || !cutOk}
                          onClick={() =>
                            void decide({ id: q.id, decision: "approve", text: edit.text })
                          }
                        >
                          Approve with this cut
                        </BlackButton>
                        <button
                          type="button"
                          className={SECONDARY}
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <BlackButton
                          disabled={busy}
                          onClick={() =>
                            void decide({ id: q.id, decision: "approve", text: q.quote })
                          }
                        >
                          Approve
                        </BlackButton>
                        <button
                          type="button"
                          className={SECONDARY}
                          disabled={busy}
                          onClick={() => setEditing({ id: q.id, text: q.quote })}
                        >
                          Take out a detail…
                        </button>
                        <button
                          type="button"
                          className={SECONDARY}
                          disabled={busy}
                          onClick={() => setRejecting(q.id)}
                        >
                          Reject…
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {shown.length ? (
        <>
          <h4 className="m-0 mt-2 font-serif text-lg font-semibold text-ap-ink">
            Shown now ({shown.length})
          </h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-ap-line py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span aria-hidden="true">{"★".repeat(q.stars) + "☆".repeat(5 - q.stars)}</span>
                  <span className="sr-only">{q.stars} of 5 stars</span>{" "}
                  <span className="font-serif italic">&ldquo;{q.published}&rdquo;</span>{" "}
                  <span className="text-ap-muted">
                    — {q.name}
                    {q.age ? `, ${q.age}` : ""}
                  </span>
                </span>
                {rejecting === q.id ? (
                  <div className="basis-full">{whyNot(q, "Take down")}</div>
                ) : (
                  <button
                    type="button"
                    className={SECONDARY}
                    disabled={busy}
                    onClick={() => setRejecting(q.id)}
                  >
                    Take down…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {failed ? (
        <p role="alert" className="m-0 text-sm text-ap-bad-ink">
          {failed}
        </p>
      ) : null}
    </div>
  );
}

/** Why a quote isn't shown: one of the four reasons, picked before the button works. */
function ReasonPicker({
  id,
  verb,
  busy,
  onCancel,
  onPick,
}: {
  id: number;
  verb: "Reject" | "Take down";
  busy: boolean;
  onCancel: () => void;
  onPick: (reason: RejectReason) => void;
}) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const first = useRef<HTMLInputElement | null>(null);
  // Opened from a button that is now gone: the first reason takes the focus.
  useEffect(() => first.current?.focus(), []);
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 rounded-[12px] border border-ap-line px-4 pb-3 pt-2 sm:max-w-[440px]">
      <legend className="px-1 text-sm font-semibold text-ap-ink">
        Why not show it? Never because it&rsquo;s critical.
      </legend>
      {REJECT_REASONS.map((r, i) => (
        <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            ref={i === 0 ? first : undefined}
            type="radio"
            name={`mira-quote-${id}-reason`}
            checked={reason === r}
            onChange={() => setReason(r)}
            className="h-4 w-4 shrink-0 accent-ap-purple"
          />
          {REJECT_REASON_LABEL[r]}
        </label>
      ))}
      <div className="mt-1 flex flex-wrap gap-2">
        <BlackButton disabled={busy || !reason} onClick={() => reason && onPick(reason)}>
          {verb}
        </BlackButton>
        <button type="button" className={SECONDARY} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
