"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Voice, VoiceTrouble } from "./useVoice";

/**
 * Talking to Mira, on screen (Mark's board "Main": Talk beside Send, a voice bar with a title,
 * Mute and End). In the calm chat's language: her photo breathing in the cloud's colours while
 * she listens, soft rings while she speaks, the words as captions, never more than two controls.
 * Everything she says is also in the chat above, and the support line stays on the page.
 */

const PHOTO = "/images/mira/mira.webp";

/** Talk, where the composer's Send sits while nothing is typed. */
export function TalkButton({
  onClick,
  disabled,
  invited,
}: {
  onClick: () => void;
  disabled: boolean;
  invited: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Talk to Mira"
      title="Talk to Mira out loud"
      className={`relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ap-ink text-[14px] font-bold text-white transition-[background-color,transform] hover:bg-[#2b2338] active:scale-95 disabled:cursor-not-allowed disabled:bg-ap-muted sm:h-12 ${invited ? "px-4" : "w-11 sm:w-auto sm:px-[18px]"}`}
    >
      {invited ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full ring-2 ring-[#bf66d9] motion-safe:animate-play-pulse"
        />
      ) : null}
      <WaveIcon />
      <span className={invited ? "" : "hidden sm:inline"}>Talk</span>
    </button>
  );
}

const TROUBLE: Record<VoiceTrouble, [title: string, text: string]> = {
  blocked: [
    "Mira can't hear you",
    "The microphone is blocked for this site. Allow it in your browser's settings and try again, or type instead.",
  ],
  "no-mic": ["No microphone found", "Connect one and try again, or type instead."],
  network: [
    "Speech recognition lost its connection",
    "Check your internet and try again, or type instead.",
  ],
  unavailable: [
    "Speech recognition isn't available",
    "Your browser's speech service is off or not offered here (on an iPhone, turn on Dictation in Settings). You can type instead.",
  ],
  failed: [
    "Listening stopped",
    "Something went wrong with the microphone. Try again, or type instead.",
  ],
};

export function VoicePanel({ voice, onType }: { voice: Voice; onType: () => void }) {
  const [tick, setTick] = useState(false);
  const { phase, pause, trouble, heard, saying } = voice;

  if (phase === "notice") {
    return (
      <section
        aria-labelledby="mira-voice-notice"
        className="rounded-[24px] border border-ap-line bg-white p-5 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] motion-safe:animate-mira-in"
      >
        <h2 id="mira-voice-notice" className="font-serif text-[19px] font-semibold">
          Before you talk
        </h2>
        <p className="mt-1.5 text-[14px] leading-normal text-ap-body">
          On this browser, its own speech service (for example Apple&apos;s or Google&apos;s) turns
          your voice into text, under that company&apos;s terms. Mira never receives or keeps any
          audio: only the text, like a typed message.
        </p>
        <label className="mt-3 flex min-h-[44px] items-center gap-3 text-[14px] text-ap-ink">
          <input
            type="checkbox"
            checked={tick}
            onChange={(e) => setTick(e.target.checked)}
            className="h-[18px] w-[18px] shrink-0 accent-[#795fc8]"
          />
          I understand
        </label>
        <div className="mt-2 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={voice.end}
            className="min-h-[44px] px-4 text-[14px] font-semibold text-ap-muted"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={voice.agree}
            disabled={!tick}
            className="inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:bg-ap-track disabled:text-ap-muted"
          >
            Start talking
          </button>
        </div>
      </section>
    );
  }

  const listening = phase === "listening";
  const speaking = phase === "speaking";
  const paused = phase === "paused";
  const [title, sub] =
    phase === "error" && trouble
      ? TROUBLE[trouble]
      : phase === "preparing"
        ? ["Getting ready…", "Starting the microphone."]
        : phase === "thinking"
          ? ["Mira is thinking", ""]
          : speaking
            ? [
                "Mira is speaking",
                voice.duplex ? "Start talking to stop her." : "Tap her photo to stop her.",
              ]
            : paused
              ? pause === "muted"
                ? ["Microphone off", "Mira can't hear you until you unmute."]
                : pause === "away"
                  ? ["Paused", "Mira stopped listening while you were away."]
                  : ["Paused", "Take your time. Resume when you're ready."]
              : heard
                ? ["Mira is listening", "Pause when you're done, or tap her photo."]
                : ["Mira is listening", "Speak whenever you're ready. She answers out loud."];
  const tapLabel =
    listening && heard
      ? "Send what you said"
      : speaking
        ? "Stop Mira and talk"
        : paused
          ? "Resume"
          : undefined;
  const caption = listening ? heard : speaking ? saying : "";

  return (
    <section
      aria-label="Talking with Mira"
      className="rounded-[28px] border border-ap-line bg-white px-4 py-3.5 shadow-[0_6px_24px_-14px_rgba(22,16,33,0.25)] motion-safe:animate-mira-in sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <button
          type="button"
          onClick={voice.tap}
          disabled={!tapLabel}
          aria-label={tapLabel ?? "Mira"}
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2 disabled:cursor-default"
        >
          <span
            aria-hidden="true"
            className={`absolute inset-0 rounded-full bg-[radial-gradient(circle_at_28%_35%,rgba(254,104,57,0.5),transparent_62%),radial-gradient(circle_at_70%_32%,rgba(191,102,217,0.55),transparent_62%),radial-gradient(circle_at_50%_82%,rgba(149,142,246,0.6),transparent_66%)] blur-[5px] transition-[opacity,transform] duration-500 ${
              listening
                ? `opacity-100 motion-safe:animate-mira-listen ${heard ? "scale-110" : ""}`
                : speaking || phase === "thinking" || phase === "preparing"
                  ? "opacity-70"
                  : "opacity-0"
            }`}
          />
          {speaking
            ? [0, 900].map((delay) => (
                <span
                  key={delay}
                  aria-hidden="true"
                  style={{ animationDelay: `${delay}ms` }}
                  className="absolute inset-1 rounded-full border-2 border-[#bf66d9]/50 opacity-0 motion-safe:animate-play-pulse motion-reduce:opacity-100"
                />
              ))
            : null}
          <Image
            src={PHOTO}
            alt=""
            width={44}
            height={44}
            unoptimized
            className={`relative h-11 w-11 rounded-full object-cover ring-2 ring-white transition-[filter,opacity] duration-300 ${paused || phase === "error" ? "opacity-70 grayscale" : ""}`}
          />
          {paused && pause === "muted" ? (
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-ap-ink text-white ring-2 ring-white"
            >
              <MicIcon off size={11} />
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1 basis-[calc(100%-74px)] sm:basis-0">
          <p
            role="status"
            className="flex items-center gap-2 text-[15px] font-semibold text-ap-ink"
          >
            {title}
            {phase === "thinking" || phase === "preparing" ? (
              <span aria-hidden="true" className="flex items-center gap-1">
                {[0, 140, 280].map((delay) => (
                  <span
                    key={delay}
                    style={{ animationDelay: `${delay}ms` }}
                    className="h-[5px] w-[5px] rounded-full bg-ap-purple opacity-60 motion-safe:animate-mira-dot"
                  />
                ))}
              </span>
            ) : null}
          </p>
          {sub ? <p className="mt-0.5 text-[13px] leading-snug text-ap-muted">{sub}</p> : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {phase === "error" ? (
            <>
              <button type="button" onClick={onType} className={QUIET}>
                Type instead
              </button>
              <button type="button" onClick={voice.resume} className={INK}>
                Try again
              </button>
            </>
          ) : (
            <>
              {paused && pause !== "muted" ? (
                <button type="button" onClick={voice.resume} className={GHOST}>
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={voice.toggleMute}
                  aria-pressed={paused && pause === "muted"}
                  disabled={phase === "preparing"}
                  className={GHOST}
                >
                  <MicIcon off={paused && pause === "muted"} size={16} />
                  {paused && pause === "muted" ? "Unmute" : "Mute"}
                </button>
              )}
              <button type="button" onClick={voice.end} className={INK}>
                End
              </button>
            </>
          )}
        </div>
      </div>

      {caption ? (
        // The words themselves are in the chat once sent; the caption is what is said right now.
        <p
          aria-hidden="true"
          className={`mt-3 text-[15px] leading-relaxed [overflow-wrap:anywhere] ${speaking ? "text-ap-plum" : "text-ap-ink"}`}
        >
          {caption.length > 180 ? `…${caption.slice(-180)}` : caption}
        </p>
      ) : null}
      <p className="mt-2.5 text-[12px] leading-snug text-ap-quiet">
        {voice.voiceless
          ? "This device has no voice of its own for Mira, so she answers in writing. "
          : ""}
        {voice.mode === "device"
          ? "Speech becomes text on this device. Mira gets only the words, never audio."
          : "Your browser's speech service turns speech into text. Mira gets only the words, never audio."}
      </p>
    </section>
  );
}

/** After End, in the chat: where the session went (signed in), with a way back to it. */
export function VoiceEnded({ voice }: { voice: Voice }) {
  const ended = voice.ended;
  if (!ended) return null;
  if (ended.status === "saving") {
    return (
      <p role="status" className={`${CARD} text-ap-muted`}>
        Saving your voice session…
      </p>
    );
  }
  if (ended.status === "failed") {
    return (
      <div role="alert" className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
        <span>Your voice session couldn&apos;t be saved.</span>
        <button type="button" onClick={voice.retrySave} className={GHOST}>
          Try again
        </button>
      </div>
    );
  }
  if (ended.status === "not-kept") {
    return (
      <p role="status" className={CARD}>
        This voice session wasn&apos;t kept: sessions are kept while &ldquo;Remember our
        conversations&rdquo; is on in{" "}
        <Link href="/mira/settings" className="font-semibold underline">
          Settings
        </Link>
        .
      </p>
    );
  }
  const { recording: r } = ended;
  const point = r.keyPoints?.[0];
  return (
    <div role="status" className={`${CARD} flex flex-col gap-2 motion-safe:animate-mira-reply`}>
      <p className="font-semibold text-ap-ink">
        Voice session saved · {minutes(r.seconds)}
        {r.you !== null ? ` · You ${r.you}% · Mira ${100 - r.you}%` : ""}
      </p>
      {point ? <p className="text-ap-body">{point}</p> : null}
      <Link
        href={`/mira/recordings/${r.id}`}
        className="inline-flex min-h-[44px] w-fit items-center rounded-full border border-ap-line px-4 text-[14px] font-semibold"
      >
        {r.keyPoints?.length ? "See its key points" : "See the session"}
      </Link>
    </div>
  );
}

/** "Under a minute", "1 min", "12 min". */
export function minutes(seconds: number): string {
  return seconds < 60 ? "Under a minute" : `${Math.round(seconds / 60)} min`;
}

const CARD = "rounded-[20px] border border-ap-line bg-white/90 p-4 text-[14px] leading-normal";
const GHOST =
  "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-ap-line bg-white px-4 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground disabled:opacity-40";
const QUIET = "min-h-[44px] px-3 text-[14px] font-semibold text-ap-muted";
const INK =
  "inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white transition-[background-color,transform] hover:bg-[#2b2338] active:scale-[0.98]";

function WaveIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    </svg>
  );
}

function MicIcon({ off = false, size }: { off?: boolean; size: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}
