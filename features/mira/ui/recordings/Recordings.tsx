"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MiraAppFrame } from "../MiraAppFrame";
import { miraApi } from "../api";

/**
 * Voice sessions with Mira (Mark's board "Home": "Session recordings"), kept as words, never
 * audio, so they are called voice sessions here. The Home card shows the latest three; the page
 * /mira/recordings shows them all. Each fetches its own list (GET /api/mira/recordings).
 */

export type SessionRow = {
  id: string;
  startedAt: string;
  seconds: number;
  /** The person's share of the session's words, in percent; null when nobody spoke. */
  you: number | null;
  /** The first key point, as the session's one line. */
  summary: string | null;
  previousAt: string | null;
};

type List = { recordings: SessionRow[]; more: boolean };
type Load = { state: "loading" } | { state: "failed" } | ({ state: "ready" } & List);

/** The account's sessions, newest first, with their loading and failed states. */
function useSessions(limit: number) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void miraApi<List>(`/api/mira/recordings?limit=${limit}`).then((res) => {
      if (res.status === 401) router.replace("/mira/start");
      else setLoad(res.ok ? { state: "ready", ...res.data } : { state: "failed" });
    });
  }, [limit, router, attempt]);
  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  };
  return { load, retry };
}

const START = "/mira?talk=1";
const PHOTO = "/images/mira/mira.webp";
const LOCALE = "en-GB";

/** "2 days since the last", "Same day as the last", or "1st first session" (the board's). */
function gap(r: SessionRow): [big: string, unit: string, note: string] {
  if (!r.previousAt) return ["1st", "", "first session"];
  const day = (iso: string) => {
    const d = new Date(iso);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const days = Math.round((day(r.startedAt) - day(r.previousAt)) / 86_400_000);
  if (days <= 0) return ["Same", "day", "as the last"];
  return [String(days), days === 1 ? "day" : "days", "since the last"];
}

export function duration(seconds: number): string {
  return seconds < 60 ? "<1 min" : `${Math.round(seconds / 60)} min`;
}

/**
 * You and Mira's shares of the words, as the board draws them: plum, then coral. `before`: a
 * session's length in the same line (phones).
 */
export function TalkShare({
  you,
  before,
  className = "",
}: {
  you: number | null;
  before?: string;
  className?: string;
}) {
  if (you === null && !before) return null;
  const share = you === null ? null : `You ${you}% · Mira ${100 - you}%`;
  return (
    <span className={`flex flex-col gap-1.5 ${className}`}>
      {you !== null ? (
        <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-ap-track">
          <span className="bg-ap-purple" style={{ width: `${you}%` }} />
          <span className="flex-1 bg-[#fe6839]/80" />
        </span>
      ) : null}
      <span className="text-[12px] text-ap-body">
        {[before, share].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

export function DurationChip({ seconds }: { seconds: number }) {
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ap-track px-3 text-[13px] font-semibold text-ap-body">
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {duration(seconds)}
    </span>
  );
}

/** One session: its date, its one line, the gap since the one before, the talk share, its length. */
export function SessionRowLink({ r }: { r: SessionRow }) {
  const at = new Date(r.startedAt);
  const [big, unit, note] = gap(r);
  const when = at.toLocaleString(LOCALE, { weekday: "long", hour: "2-digit", minute: "2-digit" });
  return (
    <Link
      href={`/mira/recordings/${r.id}`}
      className="group flex items-start gap-4 rounded-[22px] border border-ap-line bg-white p-4 shadow-ap transition-[transform,box-shadow,border-color] hover:border-[#d9d4e2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple motion-safe:hover:-translate-y-px sm:items-center sm:gap-6 sm:px-6"
    >
      <span className="flex w-12 shrink-0 flex-col items-center border-r border-ap-line pr-4 sm:w-[64px] sm:pr-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#d05976]">
          {at.toLocaleDateString(LOCALE, { weekday: "short" })}
        </span>
        <span className="font-serif text-[26px] font-bold leading-none sm:text-[30px]">
          {at.getDate()}
        </span>
        <span className="mt-0.5 whitespace-nowrap text-[11px] text-ap-muted">
          {at.toLocaleDateString(LOCALE, { month: "short" })}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[16px] font-bold text-ap-ink [overflow-wrap:anywhere]">{when}</span>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ap-plum">
          <Image
            src={PHOTO}
            alt=""
            width={20}
            height={20}
            unoptimized
            className="h-5 w-5 rounded-md object-cover"
          />
          with Mira
        </span>
        {r.summary ? (
          <span className="line-clamp-2 text-[14px] leading-snug text-ap-body sm:line-clamp-1">
            {r.summary}
          </span>
        ) : null}
        <TalkShare you={r.you} before={duration(r.seconds)} className="mt-1.5 sm:hidden" />
      </span>
      <span className="hidden w-[112px] shrink-0 flex-col items-end text-right md:flex">
        <span className="whitespace-nowrap text-[13px] text-ap-body">
          <strong className="font-serif text-[19px] text-ap-ink">{big}</strong>
          {unit ? ` ${unit}` : ""}
        </span>
        <span className="text-[12px] leading-tight text-ap-muted">{note}</span>
      </span>
      <TalkShare you={r.you} className="hidden w-[150px] shrink-0 sm:flex" />
      <span className="hidden sm:inline-flex">
        <DurationChip seconds={r.seconds} />
      </span>
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-1 shrink-0 text-ap-muted transition-transform group-hover:translate-x-0.5 sm:mt-0"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export function StartVoiceLink({ quiet = false }: { quiet?: boolean }) {
  return (
    <Link
      href={START}
      className={
        quiet
          ? "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-ap-line bg-white px-4 text-[14px] font-semibold text-ap-ink hover:bg-ap-ground"
          : "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white transition-[background-color,transform] hover:bg-[#2b2338] active:scale-[0.98]"
      }
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
      </svg>
      Start a voice session
    </Link>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[22px] border border-dashed border-ap-line p-5 sm:flex-row sm:items-center sm:gap-5">
      <Image
        src={PHOTO}
        alt=""
        width={48}
        height={48}
        unoptimized
        className="h-12 w-12 shrink-0 rounded-full object-cover"
      />
      <div className="flex-1">
        <p className="font-semibold text-ap-ink">No voice sessions yet</p>
        <p className="mt-0.5 text-[14px] leading-snug text-ap-body">
          Talk to Mira out loud, and each session waits here as words, with up to three key points.
          Never as audio.
        </p>
      </div>
      <StartVoiceLink />
    </div>
  );
}

function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 py-2">
      <p className="text-[14px] text-ap-bad-ink">Your voice sessions didn&apos;t load.</p>
      <button
        type="button"
        onClick={retry}
        className="inline-flex min-h-[44px] items-center rounded-full border border-ap-line px-4 text-[14px] font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <ul aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-[92px] rounded-[22px] bg-ap-ground motion-safe:animate-pulse" />
      ))}
    </ul>
  );
}

function Rows({ list }: { list: SessionRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {list.map((r) => (
        <li key={r.id}>
          <SessionRowLink r={r} />
        </li>
      ))}
    </ul>
  );
}

/** Home's card: the latest three sessions, "See all" and "Start a voice session". */
export function RecordingsCard() {
  const { load, retry } = useSessions(3);
  const ready = load.state === "ready" ? load : null;
  return (
    <section aria-labelledby="mira-voice-sessions" className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="mira-voice-sessions" className="font-serif text-[20px] font-semibold">
            Voice sessions
          </h2>
          <p className="text-[13px] text-ap-muted">Kept as words, never audio.</p>
        </div>
        {ready && ready.recordings.length > 0 ? (
          <div className="flex items-center gap-2">
            <Link
              href="/mira/recordings"
              className="inline-flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-ap-plum underline-offset-4 hover:underline"
            >
              See all
            </Link>
            <StartVoiceLink />
          </div>
        ) : null}
      </div>
      {load.state === "loading" ? <Skeleton rows={2} /> : null}
      {load.state === "failed" ? <Failed retry={retry} /> : null}
      {ready ? ready.recordings.length ? <Rows list={ready.recordings} /> : <Empty /> : null}
    </section>
  );
}

/** /mira/recordings: every session, newest first. */
export default function RecordingsPage() {
  const { load, retry } = useSessions(50);
  return (
    <MiraAppFrame active="home">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] font-medium motion-safe:animate-mira-in">
            Voice sessions
          </h1>
          <p className="mt-1 max-w-[52ch] text-[15px] leading-snug text-ap-body">
            Your talks with Mira, kept as words, never audio. Open one to read its key points and
            what was said, or to delete it.
          </p>
        </div>
        {load.state === "ready" && load.recordings.length > 0 ? <StartVoiceLink /> : null}
      </div>
      <div className="mt-6">
        {load.state === "loading" ? <Skeleton rows={3} /> : null}
        {load.state === "failed" ? <Failed retry={retry} /> : null}
        {load.state === "ready" ? (
          load.recordings.length ? (
            <>
              <Rows list={load.recordings} />
              {load.more ? (
                <p className="mt-4 text-[13px] text-ap-muted">Showing your 50 latest sessions.</p>
              ) : null}
            </>
          ) : (
            <Empty />
          )
        ) : null}
      </div>
    </MiraAppFrame>
  );
}
