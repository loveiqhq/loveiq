"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import nudgeConfig from "@features/mira/content/nudges.json";
import { EmailLinkPage, HEADING, LINK, LinkDoesNotWork } from "./EmailLinkPage";
import { PrimaryButton } from "./MiraShell";
import { miraApi } from "./api";

/**
 * Marcus's nudge unsubscribe boards (18 Nov 2026): 2 "Fewer nudges, not none?", 3 "What made you
 * stop?", 4a "Mira won't email you anymore", 4b "Saved". Reached from any of the three footer
 * links in a nudge email; the signed token in the link stands for the person. The page hands it
 * over from its cookie (app/mira/nudges/page.tsx): it is never in the address. The link alone
 * can only stop the nudges: reading and changing the choices, and turning nudges back on, need
 * the account's own sign-in, which comes back here (round-4 security SEC-R4-2).
 */

type Prefs = {
  frequency: string;
  kinds: string;
  time: string;
  next: string | null;
  paused: boolean;
  stopped: boolean;
};
type Screen = "loading" | "invalid" | "choose" | "reason" | "stopped" | "saved";
type Choice = "twice_weekly" | "pause" | "types";

const REASONS = [
  "Too many emails",
  "Wrong time of day",
  "The questions don’t fit where I am",
  "I’d rather not get this in my inbox",
  "I got what I needed",
  "Something else",
];

/** The ink pill, as a link. */
const PILL =
  "inline-flex h-[52px] w-full items-center justify-center rounded-full bg-ap-ink text-[16px] font-semibold text-white";

const SAVED_COPY: Record<Choice | "resume", { title: string; line: string }> = {
  twice_weekly: {
    title: "Saved. Fewer, but still there.",
    line: "Mira will write twice a week, only when there’s something worth following up.",
  },
  pause: {
    title: "Paused for 14 days.",
    line: "No nudges for two weeks, then Mira picks up where you left off.",
  },
  types: {
    title: "Saved. Only the nudges you kept.",
    line: "Mira will only send the kinds of nudges you chose.",
  },
  resume: { title: "Nudges are back on.", line: "Mira will write again at your chosen time." },
};

/** The sign-in, coming back to this page (server/session.ts safeNext lets it through). */
const SIGN_IN = "/mira/start?next=%2Fmira%2Fnudges";

/**
 * `invalid`: the page found the link was not one we signed, so nothing is asked of the API.
 * `signedIn`: the link's own account is signed in, so its choices can be read and changed.
 */
export default function MiraNudges({
  token,
  invalid = false,
  signedIn = false,
}: {
  token: string;
  invalid?: boolean;
  signedIn?: boolean;
}) {
  const [screen, setScreen] = useState<Screen>(
    invalid ? "invalid" : signedIn ? "loading" : "choose"
  );
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [choice, setChoice] = useState<Choice>("twice_weekly");
  const [kept, setKept] = useState<string[]>(nudgeConfig.types.map((t) => t.id));
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Choice | "resume">("twice_weekly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Each new screen moves focus to its heading, so a screen reader announces the change.
  useEffect(() => {
    if (screen !== "loading") heading.current?.focus();
  }, [screen]);

  useEffect(() => {
    if (invalid || !signedIn) return;
    void (async () => {
      // The token in the body, never in an address (DATA-1).
      const res = await miraApi<{ prefs: Prefs; types: string[] | null }>(
        "/api/mira/nudges/preferences",
        { body: { action: "read", t: token } }
      );
      if (!res.ok) return setScreen("invalid");
      setPrefs(res.data.prefs);
      if (res.data.types?.length) setKept(res.data.types);
      setScreen(res.data.prefs.stopped ? "stopped" : "choose");
    })();
  }, [token, invalid, signedIn]);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await miraApi<{ prefs: Prefs | null }>("/api/mira/nudges/preferences", {
      body: { t: token, ...body },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "That didn’t save. Please try again.");
      return false;
    }
    if (res.data.prefs) setPrefs(res.data.prefs);
    return true;
  }

  async function save() {
    const ok = await post(
      choice === "types" ? { action: "save", choice, types: kept } : { action: "save", choice }
    );
    if (ok) {
      setSaved(choice);
      setScreen("saved");
    }
  }

  async function stop(withReason: boolean) {
    const ok = await post({
      action: "stop",
      reason: withReason ? reason : null,
      note: withReason ? note.trim() || null : null,
    });
    if (!ok) return;
    if (!withReason) {
      setReason(null);
      setNote("");
    }
    setScreen("stopped");
  }

  async function resume() {
    if (await post({ action: "resume" })) {
      setSaved("resume");
      setScreen("saved");
    }
  }

  return (
    <EmailLinkPage>
      {screen === "loading" ? <p className="text-[15px] text-ap-muted">Loading…</p> : null}

      {screen === "invalid" ? (
        <LinkDoesNotWork
          headingRef={heading}
          elsewhere={
            <>
              change Mira’s nudges in{" "}
              <Link href="/mira/settings#notifications" className={LINK}>
                Settings › Notifications
              </Link>
              .
            </>
          }
        />
      ) : null}

      {screen === "choose" ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 ref={heading} tabIndex={-1} className={HEADING}>
              Fewer nudges, not none?
            </h1>
            <p className="text-[15px] leading-relaxed text-ap-body">
              {signedIn
                ? "Mira can stay in touch in a lighter way. Pick what suits you."
                : "Mira can stay in touch in a lighter way: twice a week, a pause for 14 days, or only the kinds of nudges you choose. Sign in to pick one."}
            </p>
          </div>
          {signedIn ? (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="sr-only">Your nudge choice</legend>
              {(
                [
                  [
                    "twice_weekly",
                    "Twice a week",
                    "Mira only writes when there’s something worth following up.",
                  ],
                  [
                    "pause",
                    "Pause for 14 days",
                    "No nudges for two weeks, then Mira picks up where you left off.",
                  ],
                  ["types", "Only some nudges", "Keep the kinds that help you."],
                ] as const
              ).map(([id, title, line]) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-start gap-3.5 rounded-[18px] border p-4 ${choice === id ? "border-ap-purple bg-ap-lilac" : "border-ap-line"}`}
                >
                  <input
                    type="radio"
                    name="choice"
                    checked={choice === id}
                    onChange={() => setChoice(id)}
                    className="mt-0.5 h-5 w-5 flex-none accent-ap-purple"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-[15px] font-bold">{title}</span>
                    <span className="text-[13px] leading-normal text-ap-body">{line}</span>
                    {id === "types" && choice === "types" ? (
                      <span className="flex flex-wrap gap-1.5 pt-1.5">
                        {nudgeConfig.types.map((t) => {
                          const on = kept.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setKept((k) => (on ? k.filter((x) => x !== t.id) : [...k, t.id]))
                              }
                              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${on ? "border-[1.5px] border-ap-purple text-ap-plum" : "border border-ap-line text-ap-body"}`}
                            >
                              {t.title}
                            </button>
                          );
                        })}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="mt-2 flex flex-col items-center gap-3">
            {signedIn ? (
              <div className="w-full [&>button]:w-full">
                <PrimaryButton
                  onClick={save}
                  disabled={busy || (choice === "types" && kept.length === 0)}
                >
                  Save my choice
                </PrimaryButton>
              </div>
            ) : (
              <Link href={SIGN_IN} className={PILL}>
                Sign in to choose
              </Link>
            )}
            <button
              type="button"
              onClick={() => setScreen("reason")}
              className="p-2.5 text-[14px] font-bold text-ap-body"
            >
              Stop all nudges
            </button>
          </div>
        </>
      ) : null}

      {screen === "reason" ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => setScreen("choose")}
            className="self-start text-[14px] font-bold text-ap-body"
          >
            <span aria-hidden="true">← </span>Back
          </button>
          <div className="flex flex-col gap-2">
            <h1 ref={heading} tabIndex={-1} className={HEADING}>
              What made you stop?
            </h1>
            <p className="text-[15px] leading-relaxed text-ap-body">
              Your answer helps Mira write better nudges. It’s optional.
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Reason for stopping nudges</legend>
            {REASONS.map((r) => (
              <label
                key={r}
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-full border px-4 text-[14px] font-semibold ${reason === r ? "border-ap-purple bg-ap-lilac" : "border-ap-line"}`}
              >
                <input
                  type="radio"
                  name="reason"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="h-[18px] w-[18px] accent-ap-purple"
                />
                {r}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ap-body">
            Anything else? (optional)
            <textarea
              rows={2}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell us in your own words"
              className="resize-none rounded-lg border border-ap-line bg-white px-3 py-2.5 text-[16px] font-normal"
            />
          </label>
          <p className="text-[13px] leading-normal text-ap-body">
            Stopping also turns off your journal reminder and pauses your weekly session’s
            reminders.
          </p>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => stop(true)}
              className="h-[52px] w-full rounded-full bg-ap-ink text-[16px] font-semibold text-white disabled:opacity-60"
            >
              Stop nudges
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => stop(false)}
              className="p-2.5 text-[14px] font-bold text-ap-body"
            >
              Skip and stop nudges
            </button>
          </div>
        </>
      ) : null}

      {screen === "stopped" ? (
        <>
          <div className="flex flex-col gap-2 pt-4">
            <h1 ref={heading} tabIndex={-1} className={HEADING}>
              Mira won’t email you anymore
            </h1>
            <p className="text-[15px] leading-relaxed text-ap-body">
              You’ve stopped all nudges. Your journal reminder is off and your weekly session’s
              reminders are paused too.
              {reason || note.trim() ? " Thank you for telling us why." : ""} Turn any of them back
              on in{" "}
              <Link href="/mira/settings#notifications" className={LINK}>
                Settings › Notifications
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[20px] bg-ap-mist/40 p-[18px]">
            <span className="text-[14px] font-bold">Your chats stay yours</span>
            <span className="text-[13px] leading-normal text-ap-body">
              Your conversations, agreements and assessment results aren’t affected.
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[20px] border border-ap-line p-[18px]">
            <span className="text-[14px] font-bold">Mira is still here</span>
            <span className="text-[13px] leading-normal text-ap-body">
              Whenever you want to talk, open the chat. She’ll pick up where you left off.
            </span>
            <Link href="/mira" className="pt-1 text-[14px] font-bold text-ap-plum">
              Talk to Mira
            </Link>
          </div>
          {signedIn ? (
            <button
              type="button"
              disabled={busy}
              onClick={resume}
              className="mt-2 p-2.5 text-[14px] font-bold text-ap-body"
            >
              Changed your mind? Turn nudges back on
            </button>
          ) : (
            <Link
              href={SIGN_IN}
              className="mt-2 p-2.5 text-center text-[14px] font-bold text-ap-body"
            >
              Changed your mind? Sign in to turn nudges back on
            </Link>
          )}
        </>
      ) : null}

      {screen === "saved" && prefs ? (
        <>
          <div className="flex flex-col gap-2 pt-4">
            <h1 ref={heading} tabIndex={-1} className={HEADING}>
              {SAVED_COPY[saved].title}
            </h1>
            <p className="text-[15px] leading-relaxed text-ap-body">{SAVED_COPY[saved].line}</p>
          </div>
          <dl className="flex flex-col">
            {(
              [
                ["Frequency", prefs.paused ? "Paused for 14 days" : prefs.frequency],
                ["Nudges", prefs.kinds],
                ["Time", `${prefs.time} your time`],
                ["Next nudge", prefs.next ?? "None"],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-3 border-b border-ap-line py-3.5 text-[14px]"
              >
                <dt className="flex-none text-ap-body">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <Link href="/mira/home" className={PILL}>
              Back to Mira
            </Link>
            <button
              type="button"
              onClick={() => setScreen("choose")}
              className="p-2.5 text-[14px] font-bold text-ap-body"
            >
              Change again
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </EmailLinkPage>
  );
}
