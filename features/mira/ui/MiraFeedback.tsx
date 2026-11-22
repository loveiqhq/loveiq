"use client";

import Link from "next/link";
import { useState } from "react";
import { COACHES } from "@features/mira/content/coaches";
import { PrimaryButton } from "./MiraShell";
import { MiraAppFrame } from "./MiraAppFrame";
import { miraApi } from "./api";
import { AdultsOnly } from "./kit";

/**
 * Board 10, "Help us shape what comes next": challenges, wishes and open feedback. Each coach's
 * challenge by the name the coaches page gives it (SET-11: one name per thing), then the ones no
 * coach covers yet.
 */
const CHALLENGES = [
  ...COACHES.map((c) => c.challenge),
  "Performance pressure",
  "Trust after cheating",
  "Another challenge",
];

export default function MiraFeedback({ minor: stopped = false }: { minor?: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [wish, setWish] = useState("");
  const [other, setOther] = useState("");
  // Unticked until the person says yes (GDPR: no pre-ticked consent).
  const [mayEmail, setMayEmail] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refused as under 18: the one refusal in place of the form, for good (decision 9), from the
  // start when the page knows it (R3-DATA-5).
  const [minor, setMinor] = useState(stopped);

  async function submit() {
    if (busy) return;
    // Every question is optional, but an answer with none of them says nothing (UX-16).
    if (picked.length === 0 && !wish.trim() && !other.trim()) {
      setError("Pick a challenge or write a few words first.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await miraApi("/api/mira/event", {
      body: {
        type: "feedback",
        challenges: picked,
        wish: wish.trim() || undefined,
        other: other.trim() || undefined,
        mayEmail,
      },
    });
    if (r.ok) return setSent(true);
    if (r.minor) return setMinor(true);
    setBusy(false);
    setError(r.data.error ?? "We couldn't send that. Please try again.");
  }

  return (
    <MiraAppFrame active="feedback">
      <Link href="/mira/home" className="text-[14px] text-ap-plum">
        ← Back to home
      </Link>
      <h1 className="mt-3 font-serif text-[34px] font-medium">Help us shape what comes next</h1>
      <p className="mt-1 text-[15px] text-ap-body">
        Two minutes, all optional. Every answer is read by our team.
      </p>
      {/* Always in the page, so screen readers announce the thank-you when it appears. */}
      <div role="status">
        {sent ? (
          <p className="mt-8 text-[16px] text-ap-good-ink">
            Thank you. Your feedback is with the team.
          </p>
        ) : null}
        {minor ? <AdultsOnly className="mt-8" /> : null}
      </div>
      {sent || minor ? null : (
        <form
          className="mt-6 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="text-[16px] font-bold">
              Which challenges would you like a coach for?
            </legend>
            <p className="text-[14px] text-ap-muted">Pick as many as you like.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHALLENGES.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                    className={`min-h-[40px] rounded-full border px-4 text-[14px] ${on ? "border-ap-purple bg-ap-lilac font-semibold" : "border-ap-line"}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-2 text-[16px] font-bold">
            What do you wish Mira could do?
            <textarea
              value={wish}
              maxLength={2000}
              onChange={(e) => setWish(e.target.value)}
              rows={3}
              className="rounded-2xl border border-ap-field bg-white p-3 text-[16px] font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-[16px] font-bold">
            Any other ideas or feedback?
            <textarea
              value={other}
              maxLength={2000}
              onChange={(e) => setOther(e.target.value)}
              rows={3}
              className="rounded-2xl border border-ap-field bg-white p-3 text-[16px] font-normal"
            />
          </label>
          <label className="flex items-center gap-3 text-[14px]">
            <input
              type="checkbox"
              checked={mayEmail}
              onChange={(e) => setMayEmail(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-ap-purple"
            />
            You may email me with a follow-up question about my feedback
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Never squeezed by the note beside it, so its label stays on one line (UX-8). */}
            <span className="shrink-0">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send feedback"}
              </PrimaryButton>
            </span>
            <span className="text-[13px] text-ap-muted">
              Please don&apos;t include anything you wouldn&apos;t want our team to read.
            </span>
          </div>
          {error ? (
            <p role="alert" className="text-ap-bad-ink">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </MiraAppFrame>
  );
}
