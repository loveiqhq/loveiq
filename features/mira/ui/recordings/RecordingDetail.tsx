"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MiraAppFrame } from "../MiraAppFrame";
import { miraApi } from "../api";
import { DurationChip, TalkShare } from "./Recordings";

/**
 * /mira/recordings/[id]: one voice session with Mira, as words: its key points first, then what
 * was said, and a way to delete it (its words go from the chat too). GET, POST and DELETE
 * /api/mira/recordings/[id].
 */

type Detail = {
  recording: {
    id: string;
    chatId: string;
    startedAt: string;
    seconds: number;
    you: number | null;
    /** Null: not written yet (the model was down), so they can be asked for again. */
    keyPoints: string[] | null;
  };
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
};
type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "failed" }
  | ({ state: "ready" } & Detail)
  | { state: "deleted" };

const BACK = "/mira/recordings";

export default function RecordingDetail({ id }: { id: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [writing, setWriting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void miraApi<Detail>(`/api/mira/recordings/${id}`).then((res) => {
      if (res.status === 401) return router.replace("/mira/start");
      setLoad(
        res.ok
          ? { state: "ready", ...res.data }
          : res.status === 404
            ? { state: "missing" }
            : { state: "failed" }
      );
    });
  }, [id, router, attempt]);

  async function writePoints() {
    setWriting(true);
    setError(null);
    const res = await miraApi<{ keyPoints: string[] }>(`/api/mira/recordings/${id}`, {
      method: "POST",
      body: {},
    });
    setWriting(false);
    if (!res.ok) return setError(res.data.error ?? "That didn't work. Please try again.");
    setLoad((l) =>
      l.state === "ready"
        ? { ...l, recording: { ...l.recording, keyPoints: res.data.keyPoints } }
        : l
    );
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    const res = await miraApi(`/api/mira/recordings/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) return setError(res.data.error ?? "Unable to delete right now. Please try again.");
    setLoad({ state: "deleted" });
  }

  return (
    <MiraAppFrame active="recordings">
      <Link
        href={BACK}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-ap-plum"
      >
        <span aria-hidden="true">←</span> Voice sessions
      </Link>

      {load.state === "loading" ? (
        <div aria-hidden="true" className="mt-4 flex flex-col gap-4">
          <div className="h-10 w-2/3 rounded-xl bg-ap-ground motion-safe:animate-pulse" />
          <div className="h-32 rounded-[22px] bg-ap-ground motion-safe:animate-pulse" />
        </div>
      ) : null}

      {load.state === "missing" || load.state === "failed" || load.state === "deleted" ? (
        <div role={load.state === "deleted" ? "status" : "alert"} className="mt-6 max-w-[560px]">
          <h1 className="font-serif text-[28px] font-medium">
            {load.state === "deleted"
              ? "Session deleted"
              : load.state === "missing"
                ? "This session isn't here"
                : "This session didn't load"}
          </h1>
          <p className="mt-2 text-[15px] leading-snug text-ap-body">
            {load.state === "deleted"
              ? "Its key points and its words are gone, here and in the chat."
              : load.state === "missing"
                ? "It may have been deleted, or it belongs to another account."
                : "Please check your connection and try again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {load.state === "failed" ? (
              <button
                type="button"
                onClick={() => {
                  setLoad({ state: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className={INK}
              >
                Try again
              </button>
            ) : null}
            <Link href={BACK} className={load.state === "failed" ? GHOST : INK}>
              Your voice sessions
            </Link>
          </div>
        </div>
      ) : null}

      {load.state === "ready" ? (
        <article className="mt-3 max-w-[760px] motion-safe:animate-mira-in">
          <h1 className="font-serif text-[28px] font-medium leading-tight sm:text-[32px]">
            {new Date(load.recording.startedAt).toLocaleString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-ap-plum">
              <Image
                src="/images/mira/mira.webp"
                alt=""
                width={24}
                height={24}
                unoptimized
                className="h-6 w-6 rounded-lg object-cover"
              />
              with Mira
            </span>
            <DurationChip seconds={load.recording.seconds} />
            <TalkShare you={load.recording.you} className="w-[170px]" />
          </div>

          <section
            aria-labelledby="key-points"
            className="mt-7 rounded-3xl border border-ap-line p-5"
          >
            <h2 id="key-points" className="font-serif text-[20px] font-semibold">
              Key points
            </h2>
            {load.recording.keyPoints === null ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-ap-body">
                  {writing
                    ? "Mira is writing them…"
                    : "Mira couldn't write them when the session ended."}
                </p>
                <button type="button" onClick={writePoints} disabled={writing} className={GHOST}>
                  {writing ? "Writing…" : "Write them now"}
                </button>
              </div>
            ) : load.recording.keyPoints.length === 0 ? (
              <p className="mt-2 text-[14px] leading-snug text-ap-body">
                None for this session: it was too short to sum up, or Mira shared support lines in
                it, which she never sums up.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {load.recording.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-snug text-ap-ink">
                    <span
                      aria-hidden="true"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ap-lilac text-[12px] font-bold text-ap-plum"
                    >
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="said" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="said" className="font-serif text-[20px] font-semibold">
                What was said
              </h2>
              <Link
                href={`/mira?chat=${load.recording.chatId}`}
                className="text-[14px] font-semibold text-ap-plum underline-offset-4 hover:underline"
              >
                Continue in the chat
              </Link>
            </div>
            <ol className="mt-4 flex flex-col gap-4">
              {load.transcript.map((t, i) =>
                t.role === "user" ? (
                  <li key={i} className="flex flex-col items-end">
                    <span className="sr-only">You said:</span>
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-ap-ground px-4 py-2.5 text-[15px] leading-[1.6] [overflow-wrap:anywhere] sm:max-w-[75%]">
                      {t.content}
                    </p>
                  </li>
                ) : (
                  <li key={i}>
                    <span className="sr-only">Mira said:</span>
                    <p className="whitespace-pre-wrap text-[15px] leading-[1.65] [overflow-wrap:anywhere] sm:max-w-[88%]">
                      {t.content}
                    </p>
                  </li>
                )
              )}
            </ol>
            <p className="mt-6 text-[13px] text-ap-muted">
              Mira kept the words of this session, never the audio.
            </p>
          </section>

          <section aria-label="Delete this session" className="mt-8 border-t border-ap-line pt-5">
            {confirm ? (
              <div className="rounded-[20px] border border-ap-line bg-white p-4">
                <p className="text-[14px] leading-snug text-ap-body">
                  Delete this session? Its key points and its words go, here and in the chat. This
                  can&apos;t be undone.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirm(false)} className={GHOST}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={deleting}
                    className="inline-flex min-h-[44px] items-center rounded-full bg-ap-bad-ink px-5 text-[14px] font-bold text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="min-h-[44px] text-[14px] font-semibold text-ap-bad-ink underline-offset-4 hover:underline"
              >
                Delete this session
              </button>
            )}
          </section>
          {error ? (
            <p role="alert" className="mt-3 text-[14px] text-ap-bad-ink">
              {error}
            </p>
          ) : null}
        </article>
      ) : null}
    </MiraAppFrame>
  );
}

const INK =
  "inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white";
const GHOST =
  "inline-flex min-h-[44px] items-center rounded-full border border-ap-line bg-white px-4 text-[14px] font-semibold text-ap-ink hover:bg-ap-ground disabled:opacity-60";
